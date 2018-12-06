import { observer } from "mobx-react";
import React, { Fragment } from "react";
import styled from "styled-components";
import Button from "@material-ui/core/Button/Button";
import Typography from "@material-ui/core/Typography/Typography";
import LinearProgress from "@material-ui/core/LinearProgress/LinearProgress";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import AppStore from "./appStore";

const app = new AppStore();
window.app = app;

const AppContainer = styled.div`
  margin: 0;
`;

const StyledButton = styled(Button)`
  margin: 8px;
  padding: 8px;
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
  background: #3f51b5;
  width: 80px;
  padding: 8px;
  margin: 4px;
  cursor: pointer;
  flex: 0 0 auto;
  &:hover {
    background: #5864b5;
  }
  border: ${props => {
    if (props.card.willAttack) return "1px solid red";
    if (props.card.willBlock) return "1px solid blue";
    return "1px solid transparent";
  }};
`;

const EnemyHandContainer = styled.div`
  width: 100%;
`;

const HandContainer = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
`;

const FieldContainer = styled.div`
  padding: 8px;
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  width: 100%;
  height: 150px;
`;

const Card = observer(({ card }) => {
  const { name, attack, health, cost } = card;
  return (
    <CardContainer card={card} onClick={() => app.onClickCard(card)}>
      <Typography variant="h6">{cost}</Typography>
      <Typography>{name}</Typography>
      <Typography>{attack} 🗡️</Typography>
      <Typography>{health} ❤️</Typography>
    </CardContainer>
  );
});

const DraggableCard = observer(({ card, index, isDragDisabled }) => {
  return (
    <Draggable
      draggableId={card.id}
      index={index}
      isDragDisabled={isDragDisabled}
    >
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
        >
          <Card card={card} isDragging={snapshot.isDragging} />
        </div>
      )}
    </Draggable>
  );
});

const DraggableCards = observer(({ zone }) => {
  return app.playerData[zone].map((card, index) => (
    <DraggableCard
      key={card.id}
      card={card}
      index={index}
      isDragDisabled={zone === "field" && !app.phaseIsPlayerBlocks}
    />
  ));
});

const DroppableHandArea = observer(() => {
  return (
    <Droppable droppableId="player-hand" direction="horizontal">
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          style={{
            display: "flex",
            flexWrap: "nowrap",
            overflowX: "auto",
            padding: 8,
            height: 150,
            overflow: "auto",
            width: "100%"
          }}
          {...provided.droppableProps}
        >
          <DraggableCards zone={"hand"} />
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
});

const Hand = observer(() => {
  if (!app.playerData) return null;
  return (
    <HandContainer>
      <Timer active={app.hasControl} />
      <Typography>{app.playerHandMessage}</Typography>
      <Typography>Mana: {app.playerData.mana}</Typography>
      <Typography>Life: {app.playerData.life}</Typography>
      <GameControls />
      <DroppableHandArea />
    </HandContainer>
  );
});

const DroppablePlayerFieldArea = observer(() => {
  if (!app.playerData) return null;
  return (
    <Droppable droppableId="player-field" direction="horizontal">
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          style={{
            display: "flex",
            flexWrap: "nowrap",
            overflowX: "auto",
            padding: 8,
            height: 150,
            overflow: "auto",
            width: "100%"
          }}
          {...provided.droppableProps}
        >
          <DraggableCards zone={"field"} />
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
});

const Field = observer(({ playerData }) => {
  if (!playerData) return null;
  const cards = playerData.field.map(card => {
    return <Card key={card.name} card={card} />;
  });
  return <FieldContainer>{cards}</FieldContainer>;
});

const EnemyHand = observer(() => {
  if (!app.enemyData) return null;
  return (
    <EnemyHandContainer>
      <Timer active={!app.hasControl} />
      <Typography>Enemy: {app.enemyData.id}</Typography>
      <Typography>{app.enemyData.life} Life️</Typography>
      <Typography>{app.enemyData.hand.length} Cards️</Typography>
    </EnemyHandContainer>
  );
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

const TimerContainer = styled.div`
  opacity: ${props => (props.active ? 1 : 0)};
`;

const Timer = observer(({ active }) => {
  let percent = 0;
  if (active) {
    const total = app.gameData.controlTimeLimit;
    const current = app.controlTimeRemaining;
    percent = 100 - (current / total) * 100;
  }
  return (
    <TimerContainer active={active}>
      <LinearProgress variant="determinate" color="secondary" value={percent} />
    </TimerContainer>
  );
});

const GameControls = () => {
  const disabled = app.isUpdatingGame;
  return (
    <Fragment>
      {app.hasControl && (
        <Fragment>
          <Divider />
          <StyledButton
            variant="contained"
            color="primary"
            onClick={app.onConfirm}
            disabled={disabled}
          >
            CONFIRM
          </StyledButton>
          <StyledButton
            variant="contained"
            color="secondary"
            onClick={app.passTurn}
            disabled={disabled}
          >
            PASS TURN
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
      <DragDropContext onDragEnd={app.onCardDragEnd}>
        <UserId />
        <Divider />
        {app.gameIsActive || app.gameIsComplete ? null : <Lobby />}
        <Divider />
        <EnemyHand />
        <Field playerData={app.enemyData} />
        <DroppablePlayerFieldArea />
        <Hand />
      </DragDropContext>
    </AppContainer>
  );
});

export default App;
