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
  margin: 0 8px;
`;

const UserId = observer(() => {
  if (app.userId) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Typography>{app.userId}</Typography>
        {!app.gameIsComplete && (
          <StyledButton
            variant="contained"
            color="secondary"
            onClick={app.concedeGame}
            disabled={app.isUpdatingGame}
          >
            Concede
          </StyledButton>
        )}
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

const CardText = styled(Typography)`
  color: ${props => {
    if (props.card.damageReceived > 0) return "pink";
    return "white";
  }};
`;

const CardContainer = styled.div`
  background: ${props => {
    if (props.card.isAttacking) return "red";
    if (props.card.isBlocking) return "grey";
    return "#585858";
  }};
  width: 60px;
  height: 80px;
  padding: 4px;
  margin: 4px;
  cursor: ${props => (props.isDraggable ? "grab" : "pointer")};
  flex: 0 0 auto;
  transition: background-color 1s;
  &:hover {
    background: #626262;
  }
  border: ${props => {
    if (props.card.willAttack) return "2px solid red";
    if (props.card.willBlock) return "2px solid #e0e0e0";
    if (props.isDraggable) return "2px solid rgba(255,255,255,0.5)";
    return "2px solid transparent";
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

const fieldStyles = {
  display: "flex",
  flexWrap: "nowrap",
  padding: 8,
  height: 100,
  width: "100%",
  background: "#262626"
};

const getDroppableFieldStyles = snapshot => {
  if (snapshot.isDraggingOver) {
    return {
      ...fieldStyles,
      background: "#2d2d2d"
    };
  }
  return fieldStyles;
};

const handStyles = {
  ...fieldStyles,
  overflowX: "auto"
};

const BothFieldsContainer = styled.div`
  display: flex;
  flex-direction: column;
  overflow-x: auto;
  width: 100%;
  background: #262626;
`;

const FieldContainer = styled.div(fieldStyles);

const Card = observer(({ card, isDraggable }) => {
  const { isAttacking, isBlocking, name, attack, health, damageReceived, cost } = card;
  return (
    <CardContainer
      card={card}
      isDraggable={isDraggable}
      onClick={() => app.onClickCard(card)}
    >
      <Typography>{cost} 💰</Typography>
      <Typography>{attack} 🗡️</Typography>
      <CardText card={card}>{health - damageReceived} ❤️</CardText>
    </CardContainer>
  );
});

const DraggableCard = observer(({ card, index, zone }) => {
  const isDraggable =
    zone === "hand" &&
    app.phaseIsPlayerPreAttack &&
    app.playableCardsInHand.includes(card);
  return (
    <Draggable
      draggableId={card.id}
      index={index}
      isDragDisabled={!isDraggable}
    >
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
        >
          <Card
            card={card}
            isDraggable={isDraggable}
            isDragging={snapshot.isDragging}
          />
        </div>
      )}
    </Draggable>
  );
});

const DraggableCards = observer(({ zone }) => {
  return app.playerData[zone].map((card, index) => (
    <DraggableCard key={card.id} card={card} index={index} zone={zone} />
  ));
});

const DroppableHandArea = observer(() => {
  return (
    <Droppable
      droppableId="player-hand"
      direction="horizontal"
      isDropDisabled={true}
    >
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          style={handStyles}
          {...provided.droppableProps}
        >
          <DraggableCards zone={"hand"} />
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
});

const Area = styled.div`
  display: flex;
`;

const ButtonArea = styled.div`
  padding: 8px;
`;

const Hand = observer(() => {
  if (!app.playerData) return null;
  return (
    <HandContainer>
      <GameInfo />
      <Timer active={app.hasControl} />
      <Area>
        <DroppableHandArea />
        <ButtonArea>
          <Typography>{app.playerHandMessage}</Typography>
          <Typography>Mana: {app.playerData.mana}</Typography>
          <Typography>Life: {app.playerData.life}</Typography>
          {app.hasControl && (
            <StyledButton
              variant="contained"
              color="primary"
              onClick={app.onConfirm}
              disabled={app.isUpdatingGame}
            >
              CONFIRM
            </StyledButton>
          )}
        </ButtonArea>
      </Area>
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
          style={getDroppableFieldStyles(snapshot)}
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

const GameInfo = () => {
  const disabled = app.isUpdatingGame;
  return (
    <Fragment>
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
      <DragDropContext
        onDragStart={app.onCardDragStart}
        onDragEnd={app.onCardDragEnd}
      >
        <UserId />
        <Divider />
        {app.gameIsActive || app.gameIsComplete ? null : <Lobby />}
        <Divider />
        <EnemyHand />
        <BothFieldsContainer>
          <Field playerData={app.enemyData} />
          <DroppablePlayerFieldArea />
        </BothFieldsContainer>
        <Hand />
      </DragDropContext>
    </AppContainer>
  );
});

document.addEventListener("keydown", app.handleKeyDown);

export default App;
