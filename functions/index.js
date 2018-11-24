const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.updateUser = functions.firestore
    .document('users/{userId}')
    .onUpdate((change, context) => {
        const userId = context.params.userId;

        const data = change.after.data();
        const previousData = change.before.data();
        
        // This is crucial to prevent infinite loops.
        if (data.state === previousData.state) return null;

        // Only care about searching for now
        if (data.state !== "searching") return null;
        
        const db = admin.firestore();
        return db.runTransaction( trs => {
            return trs.get(db.collection('games')
                .where('full', '==', false)
                .limit(1))
                .then( gameResult => {
                    let gameId;
                    if (gameResult.size === 1) {
                        // a game was found, add the player to it
                        const gameSnapshot = gameResult.docs[0];
                        const game = gameSnapshot.data();
                        const users = game.users.concat([userId]);
                        const full = users.length === 2;
                        const newGameData = { full: full, users: users };
                        trs.set(gameSnapshot.ref, newGameData);
                        gameId = gameSnapshot.id;
                    }
                    else {
                        // no game was found, create a new game with the player
                        const users = [userId];
                        const gameRef = db.collection('games').doc();
                        trs.set(gameRef, { full: false, users: users });
                        gameId = gameRef.id;
                    }
                    // then add a reference to the game in the player document
                    return trs.update(db.collection('users').doc(userId), { gameId: gameId, state: 'found_game' });
                });
        });
    });

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions

// Listen for updates to any `user` document.
// exports.updateUser = functions.firestore
//     .document('users/{userId}')
//     .onUpdate((change, context) => {
//         // Retrieve the current and previous value
//         const data = change.after.data();
//         const previousData = change.before.data();
//
//         console.log('context is', context);
//         console.log('data is', data);
//
//         // This is crucial to prevent infinite loops.
//         if (data.state === previousData.state) return null;
//
//         // Only care about searching for now
//         if (data.state !== "searching") return null;
//
//         console.log('ok, searching...');
//
//         admin.firestore().collection('users').onSnapshot(querySnapshot => {
//             let user;
//             if (querySnapshot.empty) {
//              console.log('its empty!');
//             }
//             console.log('querysnapshot is', querySnapshot);
//             querySnapshot.forEach(doc => {
//                 user = doc.data();
//                 console.log('doc uid is', doc.uid);
//                 console.log('doc id is', doc.id);
//                 console.log('user is', user);
//                 admin.firestore().collection('games').add({
//                     player1: context.params.userId,
//                     player2: doc.id
//                 })
//             });
//          });
//
//
//         // Then return a promise of a set operation to update the count
//         return change.after.ref.set({
//             state: 'found_game'
//         }, {merge: true});
//     });