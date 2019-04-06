const { GAME, ACTIONS, PHASE } = require("./constants");
const functions = require("firebase-functions");

exports.onUpdateGame = functions.firestore
    .document("games/{gameId}")
    .onUpdate(change => {
        const gameData = change.after.data();

        // This is crucial to prevent infinite loops.
        if (gameData.gameUpdateToCommit === null) return null;

        const db = admin.firestore();
        return db.runTransaction(async trs => {
            const transactions = [];
            const update = gameData.gameUpdateToCommit;
            const playerKey = gameData.hasControl;
            const enemyKey = playerKey === "player1" ? "player2" : "player1";
            const playerData = gameData[playerKey];
            const enemyData = gameData[enemyKey];
            const history = gameData.history;
            let state = gameData.state;
            let controlTimeOut = gameData.controlTimeOut;
            let round = gameData.round;
            let phase = gameData.phase;

            // Update swapControl when needed
            let swapControl = false;
            let hasControl = gameData.hasControl;

            if (update.action === ACTIONS.pass_turn) {
                swapControl = true;
            }

            if (update.action === ACTIONS.exit_game) {
                playerData.didExit = true;
            }

            // Update control
            if (swapControl) {
                const swapControlMap = {
                    player1: "player2",
                    player2: "player1"
                };
                hasControl = swapControlMap[hasControl];
                const controlTimeLimit = 40;
                const date = new Date();
                enemyData.mana = round < 10 ? round : 10;
                round++;
                phase = PHASE.pre_attack;
                controlTimeOut = date.setSeconds(date.getSeconds() + controlTimeLimit);
                // Reset field state
                playerData.field.forEach(card => (card.willAttack = false));
                enemyData.field.forEach(card => (card.willAttack = false));
            }

            // Update history
            update.player = playerKey;
            history.push(update);

            // Check for game end
            if (
                state !== GAME.complete &&
                (playerData.life <= 0 || enemyData.life <= 0)
            ) {
                state = GAME.complete;
                playerData.didWin = playerData.life > 0;
                enemyData.didWin = enemyData.life > 0;
                transactions.push(
                    trs.update(db.collection("users").doc(playerData.id), {
                        state: playerData.didWin ? "game_victory" : "game_loss"
                    })
                );
                transactions.push(
                    trs.update(db.collection("users").doc(enemyData.id), {
                        state: enemyData.didWin ? "game_victory" : "game_loss"
                    })
                );
            }

            // Check for game end
            else if (state !== "complete" && update.action === "concede") {
                state = GAME.complete;
                playerData.didWin = false;
                enemyData.didWin = true;
                transactions.push(
                    trs.update(db.collection("users").doc(playerData.id), {
                        state: "game_loss"
                    })
                );
                transactions.push(
                    trs.update(db.collection("users").doc(enemyData.id), {
                        state: "game_victory"
                    })
                );
            }

            transactions.push(
                trs.update(change.after.ref, {
                    player1: playerKey === "player1" ? playerData : enemyData,
                    player2: playerKey === "player2" ? playerData : enemyData,
                    hasControl,
                    controlTimeOut,
                    history,
                    state,
                    round,
                    phase,
                    gameUpdateToCommit: null
                })
            );

            return Promise.all(transactions);
        });
    });