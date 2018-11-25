import firebase from "firebase";
import { observable, action, computed, autorun } from "mobx";
import c from "./constants";

export default class AppStore {
  @observable userId;
  @observable userData = {};
  @observable gameData = {};
  @observable gameState = c.gameStates.NONE;

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

    this.usersRef = db.collection("users");
    this.gamesRef = db.collection("games");

    // AUTH
    firebase.auth().onAuthStateChanged(async user => {
      if (user) {
        const isAnonymous = user.isAnonymous;
        this.userId = user.uid;
        console.log("signed in!", this.userId);

        try {
          // Set initial user data
          this.userRef = this.usersRef.doc(this.userId);
          await this.userRef.set({
            authType: "anonymous",
            name: null,
            state: "menu"
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
  }

  subscribeToUser() {
    if (this.unsubToUser) {
      this.unsubToUser();
    }
    this.unsubToUser = this.userRef.onSnapshot(
      action(doc => {
        this.userData = doc.data();
        console.log("userData is", this.userData);
      })
    );
  }

  subscribeToGame() {
    if (this.unsubToGame) {
      this.unsubToGame();
    }
    if (!this.userData.gameId) {
      return;
    }
    console.log("gameId is", this.userData.gameId);
    this.gameRef = this.gamesRef.doc(this.userData.gameId);
    this.unsubToGame = this.gameRef.onSnapshot(
      action(doc => {
        this.gameData = doc.data();
        console.log("gameData is", this.gameData);
      })
    );
  }

  @computed
  get playerIndexInGameData() {
    return this.gameData.users
      ? this.gameData.users.indexOf(this.userId)
      : null;
  }

  @computed
  get enemyIndexInGameData() {
    return this.playerIndexInGameData === 0 ? 1 : 0;
  }

  @computed
  get playerKey() {
    if (this.gameData.users) {
      if (this.playerIndexInGameData === 0) {
        return "player1";
      } else if (this.playerIndexInGameData === 1) {
        return "player2";
      }
    }
    return null;
  }

  @computed
  get enemyKey() {
    if (this.playerKey === "player1") {
      return "player2";
    } else if (this.playerKey === "player2") {
      return "player1";
    }
    return null;
  }

  @computed
  get hasControl() {
    return (
      this.gameData.state === "active" &&
      this.gameData.hasControl === this.gameData.users.indexOf(this.userId)
    );
  }

  @computed
  get isUpdatingGame() {
    return this.gameData.gameUpdateToCommit !== null;
  }

  @action.bound
  findGame() {
    this.gameState = c.gameStates.FINDING;
    this.userRef.update({
      state: "searching"
    });
  }

  // TODO update to concede
  @action.bound
  leaveGame() {
    this.gameState = c.gameStates.NONE;
    this.userRef.update({
      state: "menu",
      gameId: null
    });
  }

  @action.bound
  attack() {
    this.gameRef.update({
      gameUpdateToCommit: {
        action: "attack"
      }
    });
  }

  @action.bound
  passTurn() {
    this.gameRef.update({
      gameUpdateToCommit: {
        action: "pass_turn"
      }
    });
  }
}
