import firebase from "firebase";
import { observable, action, computed, autorun, toJS } from "mobx";
import { GAME, USER, ACTIONS } from "./constants";

export default class AppStore {
  @observable userId;
  @observable userData = {};
  @observable gameData = {};
  @observable lastControlTimeout = null;
  @observable controlTimeRemaining = null;

  constructor() {
    // Initialize Firebase
    var config = {
      apiKey: "AIzaSyC-7MsDF-w3DzU7ifqse38gPc6ilV0wpGg",
      authDomain: "test01-8be6f.firebaseapp.com",
      databaseURL: "https://test01-8be6f.firebaseio.com",
      projectId: "test01-8be6f",
      storageBucket: "test01-8be6f.appspot.com",
      messagingSenderId: "681637153277"
    };

    // Start firebase
    if (!firebase.apps.length) {
      firebase.initializeApp(config);
    }

    const db = firebase.firestore();
    const settings = { timestampsInSnapshots: true };
    db.settings(settings);

    this.usersRef = db.collection("users");
    this.gamesRef = db.collection("games");

    // AUTH
    firebase.auth().onAuthStateChanged(async user => {
      if (user) {
        // const isAnonymous = user.isAnonymous;
        this.userId = user.uid;
        console.log("signed in!", this.userId);

        try {
          // Set initial user data
          // First thing we do is attempt to reconnect to an existing game
          this.userRef = this.usersRef.doc(this.userId);
          await this.userRef.set({
            authType: "anonymous",
            name: null,
            state: USER.attempt_reconnect
          });

          // Not sure if this will be useful...
          const user = await this.userRef.get();
          if (user.exists) {
            console.log("user exists", user);
          } else {
            console.log("user does NOT exist", user);
          }

          // Keep userData updated
          this.subscribeToUser();
        } catch (e) {
          console.log(e);
        }
      } else {
        // User is signed out.
      }
    });

    firebase
      .auth()
      .signInAnonymously()
      .catch(error => {
        // Handle Errors here.
        var errorCode = error.code;
        var errorMessage = error.message;
        console.log("sign in error", errorCode, errorMessage);
      });

    // Update gameData whenever userData.gameId
    autorun(this.subscribeToGame.bind(this));

    // Keep local timer updated
    setInterval(this.decrementTimeRemaining, 500);
  }

  subscribeToUser() {
    if (this.unsubToUser) {
      this.unsubToUser();
    }
    this.unsubToUser = this.userRef.onSnapshot(
      action(doc => {
        this.userData = doc.data();
        console.log("userData is", toJS(this.userData));
      })
    );
  }

  subscribeToGame() {
    if (this.unsubToGame) {
      this.unsubToGame();
    }
    if (!this.userData.gameId) {
      this.gameData = {};
      return;
    }
    console.log("gameId is", this.userData.gameId);
    this.gameRef = this.gamesRef.doc(this.userData.gameId);
    this.unsubToGame = this.gameRef.onSnapshot(
      action(doc => {
        this.gameData = doc.data();
        console.log("gameData is", toJS(this.gameData));
      })
    );
  }

  @action.bound
  decrementTimeRemaining() {
    // Not in a game, return
    if (!this.gameData.controlTimeOut) {
      this.lastControlTimeout = null;
      this.controlTimeRemaining = null;
      return;
    }

    // Server updated timeout, reset countdown
    if (
      (this.gameData.controlTimeOut && this.lastControlTimeout === null) ||
      this.gameData.controlTimeOut !== this.lastControlTimeout
    ) {
      this.lastControlTimeout = this.gameData.controlTimeOut;
      this.controlTimeRemaining = this.gameData.controlTimeLimit;
      return;
    }

    // request end of turn
    if (this.controlTimeRemaining <= 0) {
      // TODO to make this unhackable, switch logic to enemy requests turn end
      if (this.hasControl) {
        this.gameRef.update({
          gameUpdateToCommit: {
            action: ACTIONS.pass_turn
          }
        });
      }
      return;
    }

    // Just decrement time
    this.controlTimeRemaining = this.controlTimeRemaining - 0.5;
  }

  @computed
  get playerData() {
    if (this.gameData.player1) {
      if (this.gameData.player1.id === this.userId) {
        return this.gameData.player1;
      } else if (this.gameData.player2.id === this.userId) {
        return this.gameData.player2;
      } else {
        throw new Error("Neither player id matches userId!");
      }
    }
    return null;
  }

  @computed
  get enemyData() {
    if (this.playerData === this.gameData.player1) {
      return this.gameData.player2;
    } else if (this.playerData === this.gameData.player2) {
      return this.gameData.player1;
    }
    return null;
  }

  @computed
  get playerKey() {
    if (this.playerData === this.gameData.player1) {
      return "player1";
    } else if (this.playerData === this.gameData.player2) {
      return "player2";
    }
    return null;
  }

  @computed
  get hasControl() {
    return this.gameIsActive && this.gameData.hasControl === this.playerKey;
  }

  @computed
  get gameIsActive() {
    // Player ids ensures we're not still matchmaking
    return (
      this.gameData.state === GAME.active &&
      this.playerData &&
      this.playerData.id &&
      this.enemyData &&
      this.enemyData.id
    );
  }

  @computed
  get gameIsMatchmaking() {
    return this.gameData.state === GAME.active && !this.gameIsActive;
  }

  @computed
  get gameIsComplete() {
    return this.gameData.state === GAME.complete;
  }

  @computed
  get isUpdatingGame() {
    return this.gameData.gameUpdateToCommit !== null;
  }

  @action.bound
  findGame() {
    this.userRef.update({
      state: USER.searching
    });
  }

  // TODO update to concede
  @action.bound
  leaveGame() {
    this.userRef.update({
      state: USER.menu,
      gameId: null
    });
  }

  @action.bound
  exitCompleteGame() {
    this.userRef.update({
      state: USER.menu,
      gameId: null
    });
    this.gameRef.update({
      gameUpdateToCommit: {
        action: ACTIONS.exit_game
      }
    });
  }

  @action.bound
  attack() {
    this.gameRef.update({
      gameUpdateToCommit: {
        action: ACTIONS.attack
      }
    });
  }

  @action.bound
  passTurn() {
    this.gameRef.update({
      gameUpdateToCommit: {
        action: ACTIONS.pass_turn
      }
    });
  }

  @action.bound
  concedeGame() {
    this.gameRef.update({
      gameUpdateToCommit: {
        action: ACTIONS.concede
      }
    });
  }
}
