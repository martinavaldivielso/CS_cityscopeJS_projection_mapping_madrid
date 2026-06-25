import React from "react";
import { Anchor, Vector } from "./Keystoner";

const anchorSize = 20;
const anchorInset = 16;

const vectorToTransform = (vector: Vector) =>
  `translate(${vector[0]}px, ${vector[1]}px)`;

const styles = {
  container: {
    width: anchorSize,
    height: anchorSize,
    borderRadius: "50%",
    position: "absolute" as "absolute",
    border: "2px solid white",
    cursor: "move",
    backgroundColor: "rgba(255, 0, 0, 0.65)",
    zIndex: 9999,
  },
  "top-left": {
    left: anchorInset,
    top: anchorInset,
  },
  "bottom-left": {
    left: anchorInset,
    bottom: anchorInset,
  },
  "top-right": {
    top: anchorInset,
    right: anchorInset,
  },
  "bottom-right": {
    bottom: anchorInset,
    right: anchorInset,
  },
};

export interface Props {
  position: Anchor;
  onMouseEnter?: (position: Anchor) => void;
  onMouseDown: (evt: any, position: Anchor) => void;
  onMouseUp: (position: Anchor) => void;
  translation: Vector;
  style?: React.CSSProperties;
  className?: string;
}

export const AnchorComponent = ({
  position,
  translation,
  onMouseEnter,
  onMouseDown,
  onMouseUp,
  className = "",
  style = {},
}: any) => (
  <div
    onMouseEnter={() => onMouseEnter && onMouseEnter(position)}
    onMouseDown={(evt) => onMouseDown(evt, position)}
    onMouseUp={() => onMouseUp(position)}
    className={className}
    style={{
      ...styles.container,
      ...styles[position],
      ...style,
      transform: vectorToTransform(translation),
    }}
  />
);