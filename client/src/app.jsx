import { observer } from "mobx-react";
import React, { Fragment } from "react";
import styled from "styled-components";
import Button from "@material-ui/core/Button/Button";
import Typography from "@material-ui/core/Typography/Typography";
import LinearProgress from "@material-ui/core/LinearProgress/LinearProgress";
import AppStore from "./appStore";

const app = new AppStore();
window.app = app;

const AppContainer = styled.div`
  margin: 30px;
`;

const StyledButton = styled(Button)`
  margin: 10px;
  padding: 15px;
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

const CardContainer = styled.div`
  background: #111212;
  padding: 15px;
  margin: 5px;
  cursor: pointer;
  &:hover {
    background: #191b1b;
  }
  border: ${props => props.card.willAttack ? "1px solid red" : "1px solid transparent"}
`;

const HandContainer = styled.div`
  background: black;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
`;

const CardsContainer = styled.div`
  display: flex;
    padding: 15px;
  width: 100%;
`;

const FieldContainer = styled.div`
  background: black;
  padding: 15px;
  display: flex;
  width: 100%;
`;


const Card = observer(props => {
  const {card, location} = props;
  const { name, attack, health, cost } = card;
  return (
    <CardContainer onClick={() => app.onClickCard({card, location})} card={card}>
      <Typography variant="h6">{cost}</Typography>
      <Typography>{name}</Typography>
      <Typography>{attack} 🗡️</Typography>
      <Typography>{health} ❤️</Typography>
    </CardContainer>
  );
});

const Hand = observer(() => {
  if (!app.playerData) return null;
  const cards = app.playerData.hand.map(card => {
    return <Card key={card.name} card={card} location={app.playerData.hand} />;
  });
  return (
    <HandContainer>
      <Timer />
      <Typography>Mana: {app.playerData.mana}</Typography>
      <Typography>Life: {app.playerData.life}</Typography>
      <CardsContainer>
      {cards}
      </CardsContainer>
    </HandContainer>
  );
});

const Field = observer(({ playerData }) => {
  if (!playerData) return null;
  const cards = playerData.field.map(card => {
    return <Card key={card.name} card={card} location={playerData.field}/>;
  });
  return <FieldContainer>{cards}</FieldContainer>;
});

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
  return <LinearProgress variant="determinate" color="secondary" value={percent} />;
});

const Arena = () => {
  const disabled = app.isUpdatingGame;
  return (
    <Fragment>
      {app.hasControl && (
        <Fragment>
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
      <UserId />
      <Divider />
      {app.gameIsActive || app.gameIsComplete ? <Arena /> : <Lobby />}
      <Divider />
      <Field playerData={app.enemyData} />
      <Field playerData={app.playerData} />
      <Hand />
    </AppContainer>
  );
});

export default App;
