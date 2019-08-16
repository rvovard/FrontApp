// @flow
import React, { Component } from 'react';

import type { Annotation } from './AudioAnnotator';

// Component dimensions constants
const WORKBENCH_HEIGHT: number = 600;
const WORKBENCH_WIDTH: number = 1000;
const LABELS_AREA_SIZE: number = 100;
const X_AXIS_SIZE: number = 30;
const Y_AXIS_SIZE: number = 30;


type WorkbenchProps = {
  currentTime: number,
  duration: number,
  startFrequency: number,
  frequencyRange: number,
  spectrogramUrl: string,
  annotations: Array<Annotation>,
  onAnnotationCreated: any,
  onSeek: any,
};

type WorkbenchState = {
  spectrogram: ?Image,
  newAnnotation: ?Annotation,
};

class Workbench extends Component<WorkbenchProps, WorkbenchState> {

  canvasRef: any;

  isDrawing: boolean;
  drawPxMove: number;
  drawStartTime: number;
  drawStartFrequency: number;

  constructor(props: WorkbenchProps) {
    super(props);

    this.state = {
      spectrogram: undefined,
      newAnnotation: undefined,
    };

    this.canvasRef = React.createRef();

    this.isDrawing = false;
    this.drawPxMove = 0;
    this.drawStartTime = 0;
    this.drawStartFrequency = 0;
  }

  componentDidMount() {
    // Handling spectrogram image
    const spectrogram = new Image();
    spectrogram.onload = this.renderCanvas;
    spectrogram.src = this.props.spectrogramUrl;

    this.setState({spectrogram});

    document.addEventListener('pointermove', this.onUpdateNewAnnotation);
    document.addEventListener('pointerup', this.onEndNewAnnotation);
  }

  componentDidUpdate() {
    this.renderCanvas();
  }

  componentWillUnmount() {
    document.removeEventListener('pointermove', this.onUpdateNewAnnotation);
    document.removeEventListener('pointerup', this.onEndNewAnnotation);
  }

  initSizes = (wrapper: ?HTMLElement) => {
    if (wrapper) {
      const bounds: ClientRect = wrapper.getBoundingClientRect();
      const canvas: HTMLCanvasElement = this.canvasRef.current;
      canvas.height = bounds.height - LABELS_AREA_SIZE - Y_AXIS_SIZE;
      canvas.width = bounds.width - X_AXIS_SIZE;
    }
  }

  getTimeFromClientX = (clientX: number) => {
    const canvas: HTMLCanvasElement = this.canvasRef.current;
    const bounds: ClientRect = canvas.getBoundingClientRect();

    // Offset: nb of pixels from the axis (left)
    let offset: number = clientX - bounds.left;
    if (clientX < bounds.left) {
      offset = 0;
    } else if (clientX > bounds.right) {
      offset = canvas.width;
    }

    return this.props.duration * offset / canvas.width;
  }

  getFrequencyFromClientY = (clientY: number) => {
    const canvas: HTMLCanvasElement = this.canvasRef.current;
    const bounds: ClientRect = canvas.getBoundingClientRect();

    // Offset: nb of pixels from the axis (bottom)
    let offset: number = bounds.bottom - clientY;
    if (clientY < bounds.top) {
      offset = canvas.height;
    } else if (clientY > bounds.bottom) {
      offset = 0;
    }

    return this.props.startFrequency + this.props.frequencyRange * offset / canvas.height;
  }

  seekTo = (event: SyntheticPointerEvent<HTMLCanvasElement>) => {
    this.props.onSeek(this.getTimeFromClientX(event.clientX));
  }

  onStartNewAnnotation = (event: SyntheticPointerEvent<HTMLCanvasElement>) => {
    const newTime: number = this.getTimeFromClientX(event.clientX);
    const newFrequency: number = this.getFrequencyFromClientY(event.clientY);

    this.isDrawing = true;
    this.drawPxMove = 0;
    this.drawStartTime = newTime;
    this.drawStartFrequency = newFrequency;

    const newAnnotation: Annotation = {
      id: '',
      annotation: '',
      startTime: newTime,
      endTime: newTime,
      startFrequency: newFrequency,
      endFrequency: newFrequency,
    };

    this.setState({newAnnotation});
  }

  computeNewAnnotation = (e: PointerEvent) => {
    const currentTime: number = this.getTimeFromClientX(e.clientX);
    const currentFrequency: number = this.getFrequencyFromClientY(e.clientY);

    const newAnnotation: Annotation = {
      id: '',
      annotation: '',
      startTime: Math.min(currentTime, this.drawStartTime),
      endTime: Math.max(currentTime, this.drawStartTime),
      startFrequency: Math.min(currentFrequency, this.drawStartFrequency),
      endFrequency: Math.max(currentFrequency, this.drawStartFrequency),
    };
    return newAnnotation;
  }

  onUpdateNewAnnotation = (e: PointerEvent) => {
    if (this.isDrawing && ++this.drawPxMove > 2) {
      const newAnnotation: Annotation = this.computeNewAnnotation(e);
      this.setState({newAnnotation}, this.renderCanvas);
    }
  }

  onEndNewAnnotation = (e: PointerEvent) => {
    if (this.isDrawing && this.drawPxMove > 2) {
      this.props.onAnnotationCreated(this.computeNewAnnotation(e));

      this.setState({newAnnotation: undefined}, this.renderCanvas);
    }

    this.isDrawing = false;
    this.drawPxMove = 0;
  }

  renderCanvas = () => {
    const canvas: HTMLCanvasElement = this.canvasRef.current;
    const context: CanvasRenderingContext2D = canvas.getContext('2d');

    // Draw spectro image
    if (this.state.spectrogram) {
      context.drawImage(this.state.spectrogram, 0, 0, canvas.width, canvas.height);
    }

    // Progress bar
    const newX: number = Math.floor(canvas.width * this.props.currentTime / this.props.duration);
    context.fillStyle = 'rgba(0, 0, 0)';
    context.fillRect(newX, 0, 1, canvas.height);

    const renderAnnotation = (ann: Annotation) => {
      const x: number = Math.floor(canvas.width * ann.startTime / this.props.duration);
      const y: number = Math.floor(canvas.height - canvas.height * ann.startFrequency / this.props.frequencyRange);
      const width: number = Math.floor(canvas.width * (ann.endTime - ann.startTime) / this.props.duration);
      const height: number = - Math.floor(canvas.height * (ann.endFrequency - ann.startFrequency) / this.props.frequencyRange);
      context.strokeStyle = 'blue';
      context.strokeRect(x, y, width, height);
    };

    // New annotation
    if (this.state.newAnnotation) {
      renderAnnotation(this.state.newAnnotation);
    }

    // All annotations
    this.props.annotations.forEach(ann => renderAnnotation(ann));
  }

  render() {
    const canvasStyle = {
      top: LABELS_AREA_SIZE,
      left: Y_AXIS_SIZE,
    };

    return (
      <div
        className="workbench"
        ref={this.initSizes}
      >
        <canvas
          className="canvas"
          ref={this.canvasRef}
          height={WORKBENCH_HEIGHT - LABELS_AREA_SIZE - X_AXIS_SIZE}
          width={WORKBENCH_WIDTH - Y_AXIS_SIZE}
          style={canvasStyle}
          onClick={this.seekTo}
          onPointerDown={this.onStartNewAnnotation}
        ></canvas>
      </div>
    );
  }
}

export default Workbench;
