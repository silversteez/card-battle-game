import React, { Component, Fragment } from "react";
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
      <button onClick={app.findGame}>
        {app.gameState === c.gameStates.NONE && "FIND GAME"}
        {app.gameState === c.gameStates.FINDING && "SEARCHING..."}
      </button>
    </Fragment>
  );
};

const Arena = () => {
  return (
    <Fragment>
        {app.hasControl &&
        <Fragment>
            <button onClick={app.attack}>ATTACK</button>
            <button onClick={app.passTurn}>PASS</button>
        </Fragment>
        }
      <button onClick={app.concedeGame}>CONCEDE</button>
    </Fragment>
  );
};

const Main = observer(() => {
  return (
    <Fragment>
      {!app.gameData.state && <Lobby />}
      {app.gameData.state === "active" && <Arena />}
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
