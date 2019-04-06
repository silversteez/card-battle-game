const { GAME, USER, PHASE } = require("./constants");
const functions = require("firebase-functions");

exports.onUpdateUser = functions.firestore
    .document("users/{userId}")
    .onUpdate((change, context) => {
        const userId = context.params.userId;
        const user = change.after.data();
        const prevUser = change.before.data();

        console.log(`User: ${userId}, state: ${user.state}`);

        // This is crucial to prevent infinite loops.
        if (user.state === prevUser.state) return null;

        // Only care about searching for now
        if (user.state !== USER.searching && user.state !== USER.attempt_reconnect) {
            return null;
        }

        const db = admin.firestore();
        return db.runTransaction(async trs => {
            // Now that we're in transaction, make SURE user is still searching for game...
            const userRef = db.collection("users").doc(userId);
            const userDoc = await trs.get(userRef);
            if (!userDoc.exists) {
                console.log(`User: ${userId}, no longer exists...`);
                return null;
            }
            const state = userDoc.data().state;
            if (state !== USER.searching && state !== USER.attempt_reconnect) {
                console.log(`User: ${userId}, no longer searching or attempting reconnect...`);
                return null;
            }

            let gameResult = await trs.get(
                db
                    .collection("games")
                    .where("users", "array-contains", userId)
                    .where("state", "==", GAME.active)
                    .limit(1)
            );

            // Found game
            if (gameResult.size === 1) {
                const gameSnapshot = gameResult.docs[0];
                const gameId = gameSnapshot.id;
                console.log(`User: ${userId}, FOUND GAME!`);
                //  add a reference to the game in the player document
                return trs.update(userRef, {
                    gameId: gameId,
                    state: USER.found_game
                });
            }

            // If we're attempting reconnect on app load and we didn't find a game, enter menu state
            if (!gameResult.size && user.state === USER.attempt_reconnect) {
                console.log(
                    `User: ${userId}, No game to reconnect to, enter menu state!`
                );
                return trs.update(userRef, {
                    state: USER.menu
                });
            }

            // Find a game that needs player2
            gameResult = await trs.get(
                db
                    .collection("games")
                    .where("full", "==", false)
                    .limit(1)
            );

            let gameId;
            let transactions = [];
            if (gameResult.size === 1) {
                // A game was found, add the player to it
                const gameSnapshot = gameResult.docs[0];
                const game = gameSnapshot.data();
                const users = game.users.concat([userId]);
                const full = users.length === 2;
                const player2 = Object.assign(game.player2, {
                    id: userId,
                    deck: user.deck
                });
                const controlTimeLimit = 40;
                const date = new Date();
                const newGameData = {
                    full,
                    users,
                    player2,
                    controlTimeLimit,
                    controlTimeOut: date.setSeconds(date.getSeconds() + controlTimeLimit),
                    state: GAME.active
                };
                transactions.push(trs.update(gameSnapshot.ref, newGameData));
                gameId = gameSnapshot.id;
                console.log(`User: ${userId}, joined game`);
            } else {
                // No game was found, create a new game with the player
                const users = [userId];
                const gameRef = db.collection("games").doc();
                transactions.push(
                    trs.set(gameRef, {
                        full: false,
                        users: users,
                        hasControl: "player1",
                        round: 0,
                        phase: PHASE.pre_attack,
                        controlTimeLimit: null,
                        controlTimeOut: null,
                        player1: {
                            id: userId,
                            life: 30,
                            mana: 1,
                            deck: user.deck,
                            hand: [],
                            field: []
                        },
                        player2: {
                            id: null,
                            life: 30,
                            mana: 1,
                            deck: null,
                            hand: [],
                            field: []
                        },
                        history: [],
                        state: GAME.active,
                        gameUpdateToCommit: null
                    })
                );
                gameId = gameRef.id;
                console.log(`User: ${userId}, created game`);
            }
            // then add a reference to the game in the player document
            transactions.push(
                trs.update(userRef, {
                    gameId: gameId,
                    state: USER.found_game
                })
            );
            return Promise.all(transactions);
        });
    });