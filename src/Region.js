// @flow
import React, { Component } from 'react';

import type { Annotation } from './AudioAnnotator';

// Component dimensions constants
const HEADER_HEIGHT: number = 10;
const HEADER_MARGIN: number = 5;

type RegionProps = {
  annotation: Annotation,
  timePxRatio: number,
  freqPxRatio: number,
  offsetTop: number,
  offsetLeft: number,
  onRegionDeleted: (Annotation) => void,
  onRegionMoved: (Annotation) => void,
};

type RegionState = {
  left: number,
  top: number,
  width: number,
  height: number,
};

class Region extends Component<RegionProps, RegionState> {
  constructor(props: RegionProps) {
    super(props);

    const duration: number = props.annotation.endTime - props.annotation.startTime;
    const freqRange: number = props.annotation.endFrequency - props.annotation.startFrequency;

    const width: number = Math.floor(this.props.timePxRatio * duration);
    const height: number = Math.floor(this.props.freqPxRatio * freqRange) + HEADER_HEIGHT + HEADER_MARGIN;

    this.state = {
      left : Math.floor(this.props.offsetLeft),
      top: Math.floor(this.props.offsetTop) - HEADER_HEIGHT - HEADER_MARGIN,
      width,
      height,
    };
  }

  render() {
    const styles = {
      wrapper: {
        left: this.state.left,
        top: this.state.top,
        width: this.state.width,
        height: this.state.height,
      },
      header: {
        height: HEADER_HEIGHT,
        marginBottom: HEADER_MARGIN,
      },
      body: {
        height: this.state.height - HEADER_HEIGHT - HEADER_MARGIN,
      },
    };

    return (
      <div className="region" style={styles.wrapper}>
        <p className="region-header" style={styles.header}>{this.props.annotation.annotation}</p>
        <div className="region-body" style={styles.body}></div>
      </div>
    );
  }
}

export default Region;
