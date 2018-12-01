import { observer } from "mobx-react";
import React, { Fragment } from "react";
import styled from "styled-components";
import Button from "@material-ui/core/Button/Button";
import Typography from "@material-ui/core/Typography/Typography";
import LinearProgress from "@material-ui/core/LinearProgress/LinearProgress";
import AppStore from "./appStore";

const app = new AppStore();

const AppContainer = styled.div`
  margin: 30px;
`;

const StyledButton = styled(Button)`
  margin: 30px;
  padding: 50px;
`;


const UserId = observer(() => {
  if (app.userId) {
    return (
      <div>
        <Typography>{app.userId}</Typography>
      </div>
    );
  } else {
    return (
      <div>
        <Typography>---LOADING---</Typography>
      </div>
    );
  }
});

const Card = (props) => {
  return (
    <div>
      <JSON json={props}/>
    </div>
  );
};

const StyledCard = styled(Card)`

`;

const Hand = () => {

}

const JSON = ({ json }) => {
  if (!json) return null;
  const nodes = [];
  Object.entries(json).map(([a, b]) => {
    if (typeof b === "object") {
      nodes.push(
        <div key={a}>
          <Typography>{a}:</Typography>
          <JSON json={b} />
        </div>
      );
    } else {
      nodes.push(
        <div key={a}>
          <Typography>
            {a}: {b.toString()}
          </Typography>
        </div>
      );
    }
  });
  return nodes;
};

const Divider = () => <div style={{ marginBottom: 15 }} />;

const Lobby = () => {
  return (
    <Fragment>
      {app.userData.state === "searching" || app.gameIsMatchmaking ? (
        <div>
          <Typography>Searching...</Typography>
        </div>
      ) : (
        <StyledButton
          variant="contained"
          color="primary"
          onClick={app.findGame}
        >
          <Typography>FIND GAME</Typography>
        </StyledButton>
      )}
    </Fragment>
  );
};

const Timer = observer(() => {
  const total = app.gameData.controlTimeLimit;
  const current = app.controlTimeRemaining;
  const percent = 100 - (current / total) * 100;
  return (
    <div>
      <Typography>TIMER: {app.controlTimeRemaining}</Typography>
      <LinearProgress variant="determinate" color="secondary" value={percent} />
    </div>
  );
});

const Arena = () => {
  const disabled = app.isUpdatingGame;
  return (
    <Fragment>
      {app.hasControl && (
        <Fragment>
          <Timer />
          <Divider />
          <StyledButton
            variant="contained"
            color="primary"
            onClick={app.attack}
            disabled={disabled}
          >
            ATTACK
          </StyledButton>
          <StyledButton
            variant="contained"
            color="secondary"
            onClick={app.passTurn}
            disabled={disabled}
          >
            PASS
          </StyledButton>
        </Fragment>
      )}
      {!app.gameIsComplete && !app.hasControl && (
        <div>
          <Typography>ENEMY TURN...</Typography>
        </div>
      )}
      {!app.gameIsComplete && (
        <StyledButton
          variant="contained"
          color="secondary"
          onClick={app.concedeGame}
          disabled={disabled}
        >
          CONCEDE
        </StyledButton>
      )}
      {app.gameIsComplete && (
        <Fragment>
          <div>
            <Typography variant="h3">
              {app.playerData.didWin ? "YOU WON!!!" : "YOU LOST!!!"}
            </Typography>
          </div>
          <StyledButton
            variant="contained"
            color="primary"
            onClick={app.exitCompleteGame}
            disabled={disabled}
          >
            EXIT GAME
          </StyledButton>
        </Fragment>
      )}
    </Fragment>
  );
};

const App = observer(() => {
  return (
    <AppContainer>
      <UserId/>
      <Divider/>
      {app.gameIsActive || app.gameIsComplete ? <Arena /> : <Lobby />}
      <Divider />
      <JSON json={app.userData} />
      <Divider />
      <JSON json={app.gameData} />
    </AppContainer>
  );
});

export default App;
