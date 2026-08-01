import React from "react";
import { Composition } from "remotion";
import { Book60, calculateBookMetadata } from "./Book60";
import { defaultProps } from "./defaultProps";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Book60"
    component={Book60}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={923}
    defaultProps={defaultProps}
    calculateMetadata={calculateBookMetadata}
  />
);
