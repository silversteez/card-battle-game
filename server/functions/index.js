const { GAME, USER, ACTIONS } = require("./constants");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.onGameUpdate = functions.firestore
  .document("games/{gameId}")
  .onUpdate((change) => {
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

      // Update swapControl when needed
      let swapControl = false;
      let hasControl = gameData.hasControl;

      if (update.action === ACTIONS.attack) {
        enemyData.life = enemyData.life - 15;
        swapControl = true;
      }

      if (update.action === ACTIONS.pass_turn) {
        swapControl = true;
      }

      if (update.action === ACTIONS.exit_game) {
        playerData.didExit = true;
      }

      // Update control
      if (swapControl) {
        hasControl = hasControl === "player1" ? "player2" : "player1";
        const controlTimeLimit = 25;
        const date = new Date();
        controlTimeOut = date.setSeconds(date.getSeconds() + controlTimeLimit);
      }

      // Update history
      update.player = playerKey;
      history.push(update);

      // Check for game end
      if (state !== GAME.complete && (playerData.life <= 0 || enemyData.life <= 0)) {
        state = GAME.complete;
        playerData.didWin = playerData.life > 0;
        enemyData.didWin = enemyData.life > 0;
        transactions.push(trs.update(db.collection("users").doc(playerData.id), {
            state: playerData.didWin ? "game_victory" : "game_loss"
        }));
        transactions.push(trs.update(db.collection("users").doc(enemyData.id), {
          state: enemyData.didWin ? "game_victory" : "game_loss"
        }));
      }

      // Check for game end
      else if (state !== "complete" && update.action === "concede") {
        state = GAME.complete;
        playerData.didWin = false;
        enemyData.didWin = true;
        transactions.push(trs.update(db.collection("users").doc(playerData.id), {
          state: "game_loss"
        }));
        transactions.push(trs.update(db.collection("users").doc(enemyData.id), {
          state: "game_victory"
        }));
      }

      transactions.push(trs.update(change.after.ref, {
        player1: playerKey === "player1" ? playerData : enemyData,
        player2: playerKey === "player2" ? playerData : enemyData,
        hasControl,
        controlTimeOut,
        history,
        state,
        gameUpdateToCommit: null
      }));

      return Promise.all(transactions);
    });
  });

exports.updateUser = functions.firestore
  .document("users/{userId}")
  .onUpdate((change, context) => {
    const userId = context.params.userId;

    const user = change.after.data();
    const prevUser = change.before.data();

    // This is crucial to prevent infinite loops.
    if (user.state === prevUser.state) return null;

    // Only care about searching for now
    if (user.state !== USER.searching && user.state !== USER.attempt_reconnect) return null;

    const db = admin.firestore();
    return db.runTransaction(async trs => {
      const foundExistingGame = await trs
        .get(db
            .collection("games")
            .where("users", "array-contains", userId)
            .where("state", "==", GAME.active)
            .limit(1))
        .then(gameResult => {
          if (gameResult.size === 1) {
            const gameSnapshot = gameResult.docs[0];
            const gameId = gameSnapshot.id;
            //  add a reference to the game in the player document
            trs.update(db.collection("users").doc(userId), {
              gameId: gameId,
              state: USER.found_game
            });
            console.log("FOUND GAME!");
            return true;
          }
          return null;
        });

      if (foundExistingGame) {
        return null;
      }

      // If we're attempting reconnect on app load and we didn't find a game, enter menu state
      if (!foundExistingGame && user.state === "attempt_reconnect") {
        console.log("No game to reconnect to, enter menu state!");
        return trs.update(db.collection("users").doc(userId), {
          state: USER.menu
        });
      }

      return trs
        .get(
          db
            .collection("games")
            .where("full", "==", false)
            .limit(1)
        )
        .then(gameResult => {
          let gameId;
          if (gameResult.size === 1) {
            // a game was found, add the player to it
            const gameSnapshot = gameResult.docs[0];
            const game = gameSnapshot.data();
            const users = game.users.concat([userId]);
            const full = users.length === 2;
            const player2 = Object.assign(game.player2, {id: userId, deck: user.deck});
            const controlTimeLimit = 25;
            const date = new Date();
            const newGameData = {
              full,
              users,
              player2,
              controlTimeLimit,
              controlTimeOut: date.setSeconds(date.getSeconds() + controlTimeLimit),
              state: "active"
            };
            trs.update(gameSnapshot.ref, newGameData);
            gameId = gameSnapshot.id;
          } else {
            // no game was found, create a new game with the player
            const users = [userId];
            const gameRef = db.collection("games").doc();
            trs.set(gameRef, {
              full: false,
              users: users,
              hasControl: "player1",
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
            });
            gameId = gameRef.id;
          }
          // then add a reference to the game in the player document
          return trs.update(db.collection("users").doc(userId), {
            gameId: gameId,
            state: USER.found_game
          });
        });
    });
  });
