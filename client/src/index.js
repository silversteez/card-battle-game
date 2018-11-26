import React, { Fragment } from "react";
import ReactDOM from "react-dom";
import AppStore from "./appStore";
import { observer } from "mobx-react";
import { MuiThemeProvider, createMuiTheme } from "@material-ui/core/styles";
import CssBaseline from "@material-ui/core/CssBaseline";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import styled from "styled-components";
import LinearProgress from '@material-ui/core/LinearProgress';

// Fix css insertion order
// https://material-ui.com/customization/css-in-js/#css-injection-order
import JssProvider from 'react-jss/lib/JssProvider';
import { create } from 'jss';
import { createGenerateClassName, jssPreset } from '@material-ui/core/styles';
const generateClassName = createGenerateClassName();
const jss = create({
  ...jssPreset(),
  // We define a custom insertion point that JSS will look for injecting the styles in the DOM.
  insertionPoint: document.getElementById('jss-insertion-point'),
});

const AppContainer = styled.div`
  margin: 30px;
`;

const StyledButton = styled(Button)`
  margin: 30px;
  padding: 50px;
`;

const theme = createMuiTheme({
  typography: {
    useNextVariants: true,
    fontFamily: `'Share Tech Mono', monospace`
  },
  palette: {
    type: "dark"
  },
  props: {
    MuiButtonBase: {
      disableRipple: true // No more ripple, on the whole application
    }
  }
});

const app = new AppStore();

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

const JSON = ({ json }) => {
  if (!json) return null;
  const nodes = [];
  Object.entries(json).map(([a, b]) => {
    if (typeof b === "object") {
      nodes.push(
        <div key={a}>
          <Typography>{a}:</Typography><JSON json={b} />
        </div>
      );
    } else {
      nodes.push(
        <div key={a}>
          <Typography>{a}: {b.toString()}</Typography>
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
        <StyledButton variant="contained" color="primary" onClick={app.findGame}>
          <Typography>FIND GAME</Typography>
        </StyledButton>
      )}
    </Fragment>
  );
};

const Timer = observer(() => {
  const total = app.gameData.controlTimeLimit;
  const current = app.controlTimeRemaining;
  const percent = 100 - (current/total * 100);
  return (
    <div>
      <Typography>TIMER: {app.controlTimeRemaining}</Typography>
      <LinearProgress
        variant="determinate"
        color="secondary"
        value={percent}
      />
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
          <Divider/>
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
      {!app.hasControl && (
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
          <div>{app.playerData.didWin ? "YOU WON!!!" : "YOU LOST!!!"}</div>
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

const Main = observer(() => {
  return (
    <Fragment>
      {app.gameIsActive || app.gameIsComplete ? <Arena /> : <Lobby />}
      <Divider />
      <JSON json={app.userData} />
      <Divider />
      <JSON json={app.gameData} />
    </Fragment>
  );
});

function App() {
  return (
    <JssProvider jss={jss} generateClassName={generateClassName}>
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      <AppContainer>
        <UserId />
        <Main />
      </AppContainer>
    </MuiThemeProvider>
    </JssProvider>
  );
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
