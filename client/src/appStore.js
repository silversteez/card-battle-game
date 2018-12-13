import firebase from "firebase";
import { observable, action, computed, autorun, toJS } from "mobx";
import { GAME, USER, ACTIONS } from "./constants";
import uuid from "./uuid";

// min and max included
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

class Deck {
  cards = [];
  maxSize = 60;

  constructor() {
    for (let i = 0; i < this.maxSize; i++) {
      this.cards.push(this.getCard(i));
    }
  }

  getCard(i) {
    return {
      id: uuid(),
      name: "#" + i,
      attack: randomInt(1, 5),
      health: randomInt(3, 7),
      cost: randomInt(1, 5),
      damageReceived: 0,
      behaviors: {
        onSummon: [],
        onAttack: [],
        onDeath: []
      },
      willAttack: false,
      willBlock: false
    };
  }
}

export default class AppStore {
  @observable userId;
  @observable userData = {};
  @observable gameData = {};
  @observable isDraggingCard = false;
  @observable lastControlTimeout = null;
  @observable controlTimeRemaining = null;
  lastRound = 0; // Compare lastRound to round to know when to draw a card

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

    // Settings
    const db = firebase.firestore();
    const settings = { timestampsInSnapshots: true };
    db.settings(settings);

    // db refs
    this.usersRef = db.collection("users");
    this.gamesRef = db.collection("games");

    // AUTH
    firebase.auth().onAuthStateChanged(this.onAuthStateChange);
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
    autorun(this.subscribeToGame);

    // Keep local timer updated
    setInterval(this.decrementTimeRemaining, 500);
  }

  onAuthStateChange = async user => {
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
          state: USER.attempt_reconnect,
          deck: new Deck().cards
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
  };

  subscribeToUser() {
    if (this.unsubToUser) {
      this.unsubToUser();
    }
    this.unsubToUser = this.userRef.onSnapshot(this.onUserSnapshot);
  }

  subscribeToGame = () => {
    if (this.unsubToGame) {
      this.unsubToGame();
    }
    if (!this.userData.gameId) {
      this.gameData = {};
      return;
    }
    console.log("gameId is", this.userData.gameId);
    this.gameRef = this.gamesRef.doc(this.userData.gameId);
    this.unsubToGame = this.gameRef.onSnapshot(this.onGameSnapshot);
  };

  updateGameOnServer = () => {
    if (!this.gameRef) return;
    const p1 = this.gameData.player1;
    const p2 = this.gameData.player2;
    this.gameRef.update({
      player1: {
        id: p1.id,
        life: p1.life,
        mana: p1.mana,
        deck: p1.deck,
        hand: p1.hand,
        field: p1.field
      },
      player2: {
        id: p2.id,
        life: p2.life,
        mana: p2.mana,
        deck: p2.deck,
        hand: p2.hand,
        field: p2.field
      }
    });
  };

  @action.bound
  onGameSnapshot(doc) {
    this.gameData = doc.data();

    // Check for broken game state...
    if (
      this.gameData.full &&
      (this.gameData.player1.id === null || this.gameData.player2.id === null)
    ) {
      alert('exiting corrupt game');
      this.gameRef.update({
        state: "complete"
      });
      this.userRef.update({
        state: USER.menu,
        gameId: null
      });
      return;
    }

    if (this.gameData.round === 0 && this.playerData.hand.length === 0) {
      // Draw initial hand
      this.drawCards(5);
    } else if (this.hasControl && this.gameData.round > this.lastRound) {
      // Draw 1 card per turn
      this.lastRound = this.gameData.round;
      this.drawCards(1);
    }
    console.log("gameData is", toJS(this.gameData));
  }

  @action.bound
  drawCards(numCards) {
    this.playerData.hand = [
      ...this.playerData.hand,
      ...this.playerData.deck.slice(0, numCards)
    ];
    this.playerData.deck = this.playerData.deck.slice(numCards);
    this.updateGameOnServer();
  }

  @action.bound
  onUserSnapshot(doc) {
    this.userData = doc.data();
    console.log("userData is", toJS(this.userData));
  }

  @action.bound
  onConfirm() {
    // CONFIRM ATTACKS
    if (this.gameData.phase === "preAttack") {
      if (this.playerData.field.find(card => card.willAttack)) {
        // If there are any attackers, start enemy block phase
        const phase = "block";
        const hasControl = this.enemyKey;
        const controlTimeLimit = 25;
        const date = new Date();
        const controlTimeOut = date.setSeconds(
          date.getSeconds() + controlTimeLimit
        );
        this.gameRef.update({
          phase,
          hasControl,
          controlTimeOut
        });
        return;
      } else {
        // Just pass control to enemy
        const hasControl = this.enemyKey;
        const phase = "preAttack";
        const controlTimeLimit = 40;
        const date = new Date();
        const controlTimeOut = date.setSeconds(
          date.getSeconds() + controlTimeLimit
        );
        const round = this.gameData.round + 1;
        // Increase mana for next round
        this.enemyData.mana =
          this.gameData.round < 10 ? this.gameData.round + 1 : 10;
        this.gameRef.update({
          phase,
          round,
          hasControl,
          controlTimeOut,
          controlTimeLimit,
          [this.enemyKey]: this.enemyData
        });
      }
    }

    // CONFIRM BLOCKS
    if (this.gameData.phase === "block") {
      // Calc attack damage
      let damageToPlayer = 0;
      this.enemyData.field.forEach((card, i) => {
        if (card.willAttack) {
          // See if there is a matching blocker across from it
          const blockingCard = this.playerData.field[i];
          if (blockingCard && blockingCard.willBlock) {
            blockingCard.damageReceived += card.attack;
            card.damageReceived += blockingCard.attack;
          } else {
            damageToPlayer = damageToPlayer + card.attack;
          }
        }
      });

      // Remove dead cards
      this.enemyData.field = this.enemyData.field.filter(
        card => card.damageReceived < card.health
      );
      this.playerData.field = this.playerData.field.filter(
        card => card.damageReceived < card.health
      );

      this.playerData.life = this.playerData.life - damageToPlayer;

      // Increase mana for next round
      this.playerData.mana =
        this.gameData.round < 10 ? this.gameData.round + 1 : 10;

      // Set phase and KEEP control (for now)
      const phase = "preAttack";
      const controlTimeLimit = 40;
      const date = new Date();
      const controlTimeOut = date.setSeconds(
        date.getSeconds() + controlTimeLimit
      );
      const round = this.gameData.round + 1;

      // Reset field state
      this.playerData.field.forEach(card => {
        card.willAttack = false;
        card.willBlock = false;
      });
      this.enemyData.field.forEach(card => {
        card.willAttack = false;
        card.willBlock = false;
      });

      // Check for dead players
      let gameUpdateToCommit = null;
      if (this.playerData.life <= 0 || this.enemyData.life <= 0) {
        // For now this just forces server to end the game properly
        gameUpdateToCommit = {
          action: ACTIONS.pass_turn
        };
      }

      this.gameRef.update({
        phase,
        round,
        controlTimeOut,
        controlTimeLimit,
        [this.playerKey]: this.playerData,
        [this.enemyKey]: this.enemyData,
        gameUpdateToCommit
      });
      // return;
    }
  }

  @action.bound
  onClickCard(card) {
    if (!this.hasControl) return;
    if (this.playerData.hand.includes(card)) {
      if (this.gameData.phase === "preAttack") {
        if (this.playerData.mana >= card.cost) {
          // If can play cards out of hand...
          // Now done via drag n drop
        }
      }
    }
    if (this.playerData.field.includes(card)) {
      if (this.gameData.phase === "preAttack") {
        card.willAttack = !card.willAttack;
        this.updateGameOnServer();
        return;
      }
      if (this.gameData.phase === "block") {
        card.willBlock = !card.willBlock;
        this.updateGameOnServer();
      }
    }
  }

  @computed
  get playableCardsInHand() {
    return this.playerData.hand.filter(
      card => card.cost <= this.playerData.mana
    );
  }

  @action.bound
  onCardDragStart(draggable) {
    console.log("dragging", draggable);
    this.isDraggingCard = true;
  }

  @action.bound
  onCardDragEnd(result) {
    this.isDraggingCard = false;
    const { source, destination, draggableId } = result;

    // Drag didn't end on droppable
    if (!destination) {
      return;
    }

    if (
      source.droppableId === destination.droppableId &&
      source.droppableId === "player-hand"
    ) {
      // Reorder hand
      this.playerData.hand = reorderDroppable(
        this.playerData.hand,
        source.index,
        destination.index
      );
    } else if (
      source.droppableId === destination.droppableId &&
      source.droppableId === "player-field"
    ) {
      // Reorder field
      this.playerData.field = reorderDroppable(
        this.playerData.field,
        source.index,
        destination.index
      );
    } else if (
      source.droppableId === "player-hand" &&
      destination.droppableId === "player-field"
    ) {
      // Trying to play a card from hand to field
      const card = this.playerData.hand.find(card => card.id === draggableId);
      if (this.playerData.mana >= card.cost) {
        this.playerData.mana = this.playerData.mana - card.cost;

        // Move card from hand to field
        const [updatedHand, updatedField] = moveBetweenDroppables(
          this.playerData.hand,
          this.playerData.field,
          source,
          destination
        );
        this.playerData.hand = updatedHand;
        this.playerData.field = updatedField;
      } else {
        // TODO some warning that they don't have enough mana..
        return;
      }
    } else {
      return;
    }

    this.gameRef.update({
      [this.playerKey]: this.playerData
    });
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
      if (this.hasControl && !this.isUpdatingGame) {
        console.log("time up! passing turn...");
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
    // Check if gameData has stuff in it
    if (this.gameData.full) {
      // Return matching player data
      if (this.gameData.player1.id === this.userId) {
        return this.gameData.player1;
      } else if (this.gameData.player2.id === this.userId) {
        return this.gameData.player2;
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
  get phaseIsPlayerPreAttack() {
    return (
      this.gameIsActive &&
      this.gameData.phase === "preAttack" &&
      this.hasControl
    );
  }

  @computed
  get phaseIsEnemyPreAttack() {
    return (
      this.gameIsActive &&
      this.gameData.phase === "preAttack" &&
      !this.hasControl
    );
  }

  @computed
  get phaseIsPlayerBlocks() {
    return (
      this.gameIsActive && this.gameData.phase === "block" && this.hasControl
    );
  }

  @computed
  get phaseIsEnemyBlocks() {
    return (
      this.gameIsActive && this.gameData.phase === "block" && !this.hasControl
    );
  }

  @computed
  get playerHandMessage() {
    if (this.phaseIsPlayerPreAttack) return "Play cards!";
    if (this.phaseIsPlayerBlocks) return "Declare blockers!";
    if (this.phaseIsEnemyPreAttack) return "Enemy playing cards...";
    if (this.phaseIsEnemyBlocks) return "Enemy declaring blockers...";
    return "";
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

// Helpers
const reorderDroppable = (list, startIndex, endIndex) => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
};

const moveBetweenDroppables = (
  source,
  destination,
  droppableSource,
  droppableDestination
) => {
  const sourceClone = Array.from(source);
  const destClone = Array.from(destination);
  const [removed] = sourceClone.splice(droppableSource.index, 1);

  destClone.splice(droppableDestination.index, 0, removed);

  return [sourceClone, destClone];
};
