import React, { Fragment } from "react";
import ReactDOM from "react-dom";
import AppStore from "./appStore";
import { observer } from "mobx-react";
import c from "./constants";

import "./styles.css";

const app = new AppStore();

const UserId = observer(() => {
  if (app.userId) {
    return <div>{app.userId}</div>;
  } else {
    return <div>---LOADING---</div>;
  }
});

const JSON = ({ json }) => {
  if (!json) return null;
  const nodes = [];
  Object.entries(json).map(([a, b]) => {
    if (typeof b === "object") {
      nodes.push(
        <div key={a}>
          {a}: <JSON json={b} />
        </div>
      );
    } else {
      nodes.push(
        <div key={a}>
          {a}: {b.toString()}
        </div>
      );
    }
  });
  return nodes.length ? nodes : null;
};

const Divider = () => <div style={{ marginBottom: 15 }} />;

const Lobby = () => {
  return (
    <Fragment>
      {app.userData.state === "searching" ? (
        <div>SEARCHING...</div>
      ) : (
        <button onClick={app.findGame}>FIND GAME</button>
      )}
    </Fragment>
  );
};

const Arena = () => {
  const disabled = app.isUpdatingGame;
  return (
    <Fragment>
      {app.hasControl && (
        <Fragment>
          <button onClick={app.attack} disabled={disabled}>
            ATTACK
          </button>
          <button onClick={app.passTurn} disabled={disabled}>
            PASS
          </button>
        </Fragment>
      )}
      {!app.hasControl && <div>ENEMY TURN...</div>}
      {app.gameData.state === "complete" && (
        <Fragment>
          <div>{app.playerData.didWin ? "YOU WON!!!" : "YOU LOST!!!"}</div>
          <button onClick={app.exitCompleteGame} disabled={disabled}>
            EXIT GAME
          </button>
        </Fragment>
      )}
    </Fragment>
  );
};

const Main = observer(() => {
  return (
    <Fragment>
      {!app.gameData.state && <Lobby />}
      {(app.gameData.state === "active" ||
        app.gameData.state === "complete") && <Arena />}
      <Divider />
      <JSON json={app.userData} />
      <Divider />
      <JSON json={app.gameData} />
    </Fragment>
  );
});

function App() {
  return (
    <div className="App">
      <UserId />
      <Main />
    </div>
  );
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
