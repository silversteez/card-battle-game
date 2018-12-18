const { GAME, USER, ACTIONS, PHASE } = require("./constants");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.onGameUpdate = functions.firestore
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

exports.updateUser = functions.firestore
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
      if (!gameResult.size && user.state === "attempt_reconnect") {
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
