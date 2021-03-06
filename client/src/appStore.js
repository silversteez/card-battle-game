import firebase from "firebase";
import { observable, action, computed, autorun, toJS } from "mobx";
import { GAME, USER, ACTIONS, PHASE } from "./constants";
import uuid from "./uuid";

// TEST!

// min and max included
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

const delay = ms => new Promise(res => setTimeout(() => res(), ms));

const animDelayFactor = 2; // Change to larger number like 10 for slower attack sequence...

// TODO not all big changes go through onGameUpdateToCommit
// - see onConfirm, showAttackSequence, and fix corrupt game in onGameSnapshot 
// TODO pull swapcontrol code out into separate function?
const PLAYER_TURN_TIME_S = 10;
const PLAYER1 = "player1";
const PLAYER2 = "player2";

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
      willBlock: false,
      isAttacking: false,
      isBlocking: false
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
  db = null;

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
    const settings = { timestampsInSnapshots: true };
    this.db = firebase.firestore();
    this.db.settings(settings);

    // db refs
    this.usersRef = this.db.collection("users");
    this.gamesRef = this.db.collection("games");

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

        // Actually attempt reconnect
        this.attemptReconnectToGame();
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
    //console.log("gameId is", this.userData.gameId);
    this.gameRef = this.gamesRef.doc(this.userData.gameId);
    this.unsubToGame = this.gameRef.onSnapshot(this.onGameSnapshot);
  };

  updateGamePlayerData = () => {
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
    console.log("game snapshot:", toJS(this.gameData));

    // Check for broken game state...
    if (
      this.gameData.full &&
      (this.gameData.player1.id === null || this.gameData.player2.id === null)
    ) {
      alert("exiting corrupt game");
      this.gameRef.update({
        state: GAME.complete
      });
      this.userRef.update({
        state: USER.menu,
        gameId: null
      });
      return;
    }

    // Anything below this requires an active game
    if (!this.gameIsActive) {
      return;
    }

    // If there is an update that hasn't been committed, just do that
    // Only doing this for player that hasControl so both don't do it...
    // might need to read that in transaction to be sure they both don't do it?
    if (!this.hasControl && this.gameData.gameUpdateToCommit) {
      return this.onGameUpdateToCommit();
    }

    // Check for draw card steps
    if (this.gameData.round === 0 && this.playerData.hand.length === 0) {
      // Draw initial hand
      this.drawCards(5);
    } else if (this.hasControl && this.gameData.round > this.lastRound) {
      // Draw 1 card per turn
      this.lastRound = this.gameData.round;
      this.drawCards(1);
    }

    // Check for show attack
    if (this.gameData.phase === PHASE.show_attack) {
      this.showAttackSequence();
    }
  }

  // TODO do both players run this? currently just adding explicit call to this after each place where 1 player would've udpated gameUpdateToCommit
  // TODO put time update on server?
  async onGameUpdateToCommit() {
    try {
      return await this.db.runTransaction(async trs => {
        const gameSnapshot = await trs.get(this.gameRef);
        let gameData;
        let update;
        if (gameSnapshot.exists) {
          gameData = gameSnapshot.data();
          if (gameData.gameUpdateToCommit) {
            update = gameData.gameUpdateToCommit;
          } else {
            return Promise.reject('game.update was null, exiting transaction...');
          }
        } else {
          return Promise.reject('No gameSnaphot was found, exiting transaction...');
        }
        const transactions = [];
        const playerKey = gameData.hasControl;
        const enemyKey = playerKey === PLAYER1 ? PLAYER2 : PLAYER1;
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
            player1: PLAYER2,
            player2: PLAYER1
          };
          hasControl = swapControlMap[hasControl];
          const controlTimeLimit = PLAYER_TURN_TIME_S;
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
            trs.update(this.usersRef.doc(playerData.id), {
              state: playerData.didWin ? USER.game_victory : USER.game_loss
            })
          );
          transactions.push(
            trs.update(this.usersRef.doc(enemyData.id), {
              state: enemyData.didWin ? USER.game_victory : USER.game_loss
            })
          );
        }

        // Check for game end
        else if (state !== GAME.complete && update.action === ACTIONS.concede) {
          state = GAME.complete;
          playerData.didWin = false;
          enemyData.didWin = true;
          transactions.push(
            trs.update(this.usersRef.doc(playerData.id), {
              state: USER.game_loss
            })
          );
          transactions.push(
            trs.update(this.usersRef.doc(enemyData.id), {
              state: USER.game_victory
            })
          );
        }

        transactions.push(
          trs.update(this.gameRef, {
            player1: playerKey === PLAYER1 ? playerData : enemyData,
            player2: playerKey === PLAYER2 ? playerData : enemyData,
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
    } catch (e) {
      console.log(e);
    }
  }

  @action.bound
  drawCards(numCards) {
    this.playerData.hand = [
      ...this.playerData.hand,
      ...this.playerData.deck.slice(0, numCards)
    ];
    this.playerData.deck = this.playerData.deck.slice(numCards);
    this.updateGamePlayerData();
  }

  @action.bound
  onUserSnapshot(doc) {
    this.userData = doc.data();
    console.log("user snapshot:", toJS(this.userData));
  }

  // TODO may eventually need transaction to prevent me joining game from 2 of my devices simultaneously :)
  async attemptReconnectToGame() {
    // Find an active game I'm already in...
    let gameQuerySnapshot = await this.gamesRef
      .where("users", "array-contains", this.userId)
      .where("state", "==", GAME.active)
      .limit(1)
      .get();
    if (gameQuerySnapshot.docs[0]) {
      // Whether searching or attempting reconnect
      // If found game, update my state and exit
      const gameId = gameQuerySnapshot.docs[0].id;
      console.log(`FOUND GAME!`);
      //  add a reference to the game in the player document
      this.userRef.update({
        gameId: gameId,
        state: USER.found_game,
      });
      return true;
    }
    return false;
  }

  async onUserSearchForGame() {
    return await this.db.runTransaction(async trs => {
      try {
        const userId = this.userId;
        const userDoc = await trs.get(this.userRef);
        const userData = userDoc.data();

        // Find an active game that needs player2
        let gameQuerySnapshot = await this.gamesRef
          .where("full", "==", false)
          .where("state", "==", GAME.active)
          .limit(1)
          .get();

        let gameId;
        let transactions = [];
        if (gameQuerySnapshot.docs[0]) {
          // A game was found, add the player to it
          const gameSnapshot = await trs.get(gameQuerySnapshot.docs[0].ref);
          // const gameSnapshot = gameResult.docs[0];
          const game = gameSnapshot.data();
          const users = game.users.concat([userId]);
          const full = users.length === 2;
          const player2 = Object.assign(game.player2, {
            id: userId,
            deck: userData.deck
          });
          const controlTimeLimit = PLAYER_TURN_TIME_S;
          const date = new Date();
          const newGameData = {
            full,
            users,
            player2,
            controlTimeLimit,
            controlTimeOut: date.setSeconds(
              date.getSeconds() + controlTimeLimit
            ),
            state: GAME.active
          };
          transactions.push(trs.update(gameSnapshot.ref, newGameData));
          gameId = gameSnapshot.id;
          console.log(`User: ${userId}, joined game`);
        } else {
          // No game was found, create a new game with the player
          const users = [userId];
          const gameRef = this.db.collection("games").doc();
          transactions.push(
            trs.set(gameRef, {
              full: false,
              users: users,
              hasControl: PLAYER1,
              round: 0,
              phase: PHASE.pre_attack,
              controlTimeLimit: null,
              controlTimeOut: null,
              player1: {
                id: userId,
                life: 30,
                mana: 1,
                deck: userData.deck,
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
          trs.update(this.userRef, {
            gameId: gameId,
            state: USER.found_game
          })
        );
        return Promise.all(transactions);
      } catch (e) {
        console.log("fail!", e);
      }
    });
  }

  @action.bound
  onConfirm() {
    // CONFIRM ATTACKS
    if (this.gameData.phase === PHASE.pre_attack) {
      if (this.playerData.field.find(card => card.willAttack)) {
        // If there are any attackers, start enemy block phase
        const phase = PHASE.block;
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
        const phase = PHASE.pre_attack;
        const controlTimeLimit = PLAYER_TURN_TIME_S;
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
    if (this.gameData.phase === PHASE.block) {
      // Set phase and then we'll show attack sequence
      this.gameRef.update({
        phase: PHASE.show_attack
      });
      // Don't forget to add return statement if we add more confirmations
      // return;
    }
  }

  // BOTH players calculate and animate the attacks locally and then compare results on the server and if
  // they don't match, then we know there is a cheater... an idea to try out...
  @action.bound
  async showAttackSequence() {
    // Needs to choose who is "player" and "enemy" based on where the code is running!
    let blockingPlayerData, attackingPlayerData;
    let blockingPlayerKey, attackingPlayerKey;
    if (this.gameData.hasControl === this.playerKey) {
      console.log(`${this.playerKey} has control`);
      blockingPlayerKey = this.playerKey;
      attackingPlayerKey = this.enemyKey;
      blockingPlayerData = this.playerData;
      attackingPlayerData = this.enemyData;
    } else {
      console.log(`${this.playerKey} does not have control`);
      blockingPlayerKey = this.enemyKey;
      attackingPlayerKey = this.playerKey;
      blockingPlayerData = this.enemyData;
      attackingPlayerData = this.playerData;
    }

    console.log("starting sequence...");
    await delay(100 * animDelayFactor);

    // Calc attack damage
    let damageToPlayer = 0;
    for (let i = 0; i < attackingPlayerData.field.length; i++) {
      let card = attackingPlayerData.field[i];
      if (card.willAttack) {
        // Enable attacking visuals
        card.isAttacking = true;
        // See if there is a matching blocker across from it
        const blockingCard = blockingPlayerData.field[i];
        if (blockingCard && blockingCard.willBlock) {
          // Enable blocking visuals
          blockingCard.isBlocking = true;
          // Stop visuals
          await delay(200 * animDelayFactor);
          card.isAttacking = false;
          blockingCard.isBlocking = false;
          // Damage calc
          blockingCard.damageReceived += card.attack;
          card.damageReceived += blockingCard.attack;
        } else {
          // Stop visuals and calc player damage
          await delay(200 * animDelayFactor);
          card.isAttacking = false;
          damageToPlayer = damageToPlayer + card.attack;
        }
        console.log(`card ${i} attacked`);
        await delay(100 * animDelayFactor);
      }
    }

    console.log(`remove dead cards`);
    await delay(100 * animDelayFactor);
    // Remove dead cards
    attackingPlayerData.field = attackingPlayerData.field.filter(
      card => card.damageReceived < card.health
    );
    blockingPlayerData.field = blockingPlayerData.field.filter(
      card => card.damageReceived < card.health
    );

    console.log("adjust player life");
    await delay(100 * animDelayFactor);
    blockingPlayerData.life = blockingPlayerData.life - damageToPlayer;

    // Increase mana for next round
    blockingPlayerData.mana =
      this.gameData.round < 10 ? this.gameData.round + 1 : 10;

    // Set phase and KEEP control (for now)
    const phase = PHASE.pre_attack;
    const controlTimeLimit = PLAYER_TURN_TIME_S;
    const date = new Date();
    const controlTimeOut = date.setSeconds(
      date.getSeconds() + controlTimeLimit
    );
    const round = this.gameData.round + 1;

    // Reset field state
    blockingPlayerData.field.forEach(this.resetCard);
    attackingPlayerData.field.forEach(this.resetCard);

    console.log("field reset");
    await delay(100 * animDelayFactor);

    // Check for dead players
    let gameUpdateToCommit = null;
    if (blockingPlayerData.life <= 0 || attackingPlayerData.life <= 0) {
      // For now this just forces server to end the game properly
      gameUpdateToCommit = {
        action: ACTIONS.pass_turn
      };
    }

    console.log("attack sequence completed by:", this.playerKey);
    // For now, skip server cheating verification and just send results from player1
    if (this.playerKey === PLAYER1) {
      console.log(`${this.playerKey} is updating gameRef`);
      console.log(`blockingPlayerKey - ${blockingPlayerKey}`);
      console.log(`attackingPlayerKey - ${attackingPlayerKey}`);
      console.log(`blockingPlayerData - `, toJS(blockingPlayerData));
      console.log(`attackingPlayerData - `, toJS(attackingPlayerData));
      // awaiting here to make sure this resolves before onGameUpdateToCommit runs
      await this.gameRef.update({
        phase,
        round,
        controlTimeOut,
        controlTimeLimit,
        [blockingPlayerKey]: blockingPlayerData,
        [attackingPlayerKey]: attackingPlayerData,
        gameUpdateToCommit
      });
    }
    if (gameUpdateToCommit) {
      this.onGameUpdateToCommit();
    }
  }

  @action.bound
  handleKeyDown({ key }) {
    if (key === "a" || key === "A") {
      if (this.hasControl && this.phaseIsPlayerPreAttack) {
        this.gameRef.update({
          [this.playerKey]: {
            ...this.playerData,
            field: this.playerData.field.map(card => {
              card.willAttack = true;
              return card;
            })
          }
        });
      }
    }
  }

  @action.bound
  onClickCard(card) {
    if (!this.hasControl) return;
    if (this.playerData.hand.includes(card)) {
      if (this.gameData.phase === PHASE.pre_attack) {
        if (this.playerData.mana >= card.cost) {
          // If can play cards out of hand...
          // Now done via drag n drop
        }
      }
    }
    if (this.playerData.field.includes(card)) {
      if (this.gameData.phase === PHASE.pre_attack) {
        card.willAttack = !card.willAttack;
        this.updateGamePlayerData();
        return;
      }
      if (this.gameData.phase === PHASE.block) {
        card.willBlock = !card.willBlock;
        this.updateGamePlayerData();
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
    //console.log("dragging", draggable);
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
  async decrementTimeRemaining() {
    // Not in a game, return
    if (!this.gameData.controlTimeOut) {
      this.lastControlTimeout = null;
      this.controlTimeRemaining = null;
      return;
    }

    // Animating attacks, ignore timer
    if (this.gameData.phase === PHASE.show_attack) {
      return;
    }

    // Game is complete, ignore timer
    if (this.gameData.state === GAME.complete) {
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
      if (!this.hasControl && !this.isUpdatingGame) {
        console.log("time up! passing turn...");
        await this.gameRef.update({
          gameUpdateToCommit: {
            action: ACTIONS.pass_turn
          }
        });
        this.onGameUpdateToCommit();
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
      return PLAYER1;
    } else if (this.playerData === this.gameData.player2) {
      return PLAYER2;
    }
    return null;
  }

  @computed
  get enemyKey() {
    if (this.playerKey === PLAYER1) {
      return PLAYER2;
    } else if (this.playerKey === PLAYER2) {
      return PLAYER1;
    }
    return null;
  }

  @computed
  get hasControl() {
    return (
      this.gameIsActive &&
      this.gameData.hasControl === this.playerKey &&
      !this.phaseIsShowAttack
    );
  }

  @computed
  get userIsLoaded() {
    return !!this.userData.authType;
  }

  @computed
  get showGame() {
    return this.gameIsActive || this.gameIsComplete;
  }

  @computed
  get userMaySearchForNewGame() {
    return (
      this.userIsLoaded &&
      !this.showGame &&
      !this.gameIsMatchmaking &&
      (this.userData.state !== USER.searching ||
        this.userData.state !== USER.attempt_reconnect)
    );
  }

  @computed
  get userIsInGame() {
    return (
      this.userIsLoaded &&
      this.userData.state !== USER.menu &&
      this.userData.state !== USER.searching &&
      this.userData.state !== USER.attempt_reconnect
    );
  }

  @computed
  get gameIsActive() {
    // Player ids ensures we're not still matchmaking
    return (
      this.userIsInGame &&
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
  get phaseIsShowAttack() {
    return this.gameIsActive && this.gameData.phase === PHASE.show_attack;
  }

  @computed
  get phaseIsPlayerPreAttack() {
    return (
      this.gameIsActive &&
      this.gameData.phase === PHASE.pre_attack &&
      this.hasControl
    );
  }

  @computed
  get phaseIsEnemyPreAttack() {
    return (
      this.gameIsActive &&
      this.gameData.phase === PHASE.pre_attack &&
      !this.hasControl
    );
  }

  @computed
  get phaseIsPlayerBlocks() {
    return (
      this.gameIsActive &&
      this.gameData.phase === PHASE.block &&
      this.hasControl
    );
  }

  @computed
  get phaseIsEnemyBlocks() {
    return (
      this.gameIsActive &&
      this.gameData.phase === PHASE.block &&
      !this.hasControl
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
  async findGame() {
    this.userRef.update({
      state: USER.searching
    });
    const foundGame = await this.attemptReconnectToGame();
    if (!foundGame) {
      this.onUserSearchForGame();
    }
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
  async exitCompleteGame() {
    await this.userRef.update({
      state: USER.menu,
      gameId: null
    });
    await this.gameRef.update({
      gameUpdateToCommit: {
        action: ACTIONS.exit_game
      }
    });
    this.onGameUpdateToCommit();
  }

  @action.bound
  async passTurn() {
    await this.gameRef.update({
      gameUpdateToCommit: {
        action: ACTIONS.pass_turn
      }
    });
    this.onGameUpdateToCommit();
  }

  @action.bound
  async concedeGame() {
    await this.gameRef.update({
      gameUpdateToCommit: {
        action: ACTIONS.concede
      }
    });
    this.onGameUpdateToCommit();
  }

  @action.bound
  resetCard(card) {
    card.willAttack = false;
    card.willBlock = false;
    card.isAttacking = false;
    card.isBlocking = false;
  }

  @computed
  get jsGameData() {
    return toJS(this.gameData);
  }

  @computed
  get jsUserData() {
    return toJS(this.userData);
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
