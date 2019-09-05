// @flow
import React, { Component } from 'react';
import * as utils from '../utils';

import type { Annotation } from './AudioAnnotator';
import Region from './Region';

// Component dimensions constants
const CANVAS_HEIGHT: number = 512;
const CANVAS_WIDTH: number = 950;
const CONTROLS_AREA_SIZE: number = 80;
const SCROLLBAR_RESERVED: number = 20;
const X_AXIS_SIZE: number = 30;
const Y_AXIS_SIZE: number = 30;

type Spectrogram = {
  start: number,
  end: number,
  image: Image,
};

type WorkbenchProps = {
  tagColors: Map<string, string>,
  currentTime: number,
  duration: number,
  startFrequency: number,
  frequencyRange: number,
  spectrogramUrl: string,
  annotations: Array<Annotation>,
  zoomLevels: Array<number>,
  onAnnotationCreated: (Annotation) => void,
  onAnnotationUpdated: (Annotation) => void,
  onAnnotationDeleted: (Annotation) => void,
  onAnnotationPlayed: (Annotation) => void,
  onAnnotationSelected: (Annotation) => void,
  onSeek: any,
};

type WorkbenchState = {
  wrapperWidth: number,
  wrapperHeight: number,
  zoomFactor: number,
  timePxRatio: number,
  freqPxRatio: number,
  spectrogram: ?Image,
  spectrograms: Map<number, Array<Spectrogram>>,
  newAnnotation: ?Annotation,
};

class Workbench extends Component<WorkbenchProps, WorkbenchState> {

  /**
   * Ref to canvas wrapper is used to modify its scrollLeft property.
   * @property {any} wrapperRef React reference to the wrapper
   */
  wrapperRef: any;

  /**
   * Ref to canvas is used to modify its width and height properties.
   * @property {any} canvasRef React reference to the canvas
   */
  canvasRef: any;

  isDrawing: boolean;
  drawPxMove: number;
  drawStartTime: number;
  drawStartFrequency: number;

  constructor(props: WorkbenchProps) {
    super(props);

    this.state = {
      wrapperWidth: CANVAS_WIDTH,
      wrapperHeight: CANVAS_HEIGHT + SCROLLBAR_RESERVED,
      zoomFactor: 1,
      timePxRatio: CANVAS_WIDTH / props.duration,
      freqPxRatio: CANVAS_HEIGHT / props.frequencyRange,
      spectrogram: undefined,
      spectrograms: new Map(),
      newAnnotation: undefined,
    };

    this.wrapperRef = React.createRef();
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

    // Handling spectrogram images
    /* @todo Currently we load all images at this time, not only displayed ones
     * Implement a cache system which will load images when needed
     */
    const spectrograms = this.props.zoomLevels.map(zoomLvl => {
      const step: number = 300 / zoomLvl;

      const zoomSpectros = [...Array(zoomLvl)].map((_, i) => {
        const start: number = i * step;
        const end: number = (i + 1) * step;
        const strStart = Number.isInteger(start) ? start.toFixed(1) : start.toString();
        const strEnd = Number.isInteger(end) ? end.toFixed(1) : end.toString();

        const image = new Image();
        image.src = `/sounds/A32C0253_${strStart}_${strEnd}.png`;
        image.onload = this.renderCanvas;
        return {start, end, image};
      });

      return [zoomLvl, zoomSpectros];
    });

    this.setState({spectrograms: new Map(spectrograms)});

    // Add event listeners at the document level
    // (the user is able to release the click on any zone)
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

  initSizes = (workbench: ?HTMLElement) => {
    if (workbench) {
      const bounds: ClientRect = workbench.getBoundingClientRect();
      const canvas: HTMLCanvasElement = this.canvasRef.current;
      const wrapperWidth: number = Math.floor(bounds.width - Y_AXIS_SIZE);

      canvas.width = wrapperWidth; // Adapt width to available space
      canvas.height = CANVAS_HEIGHT; // Force height

      this.setState({
        wrapperWidth: wrapperWidth,
        wrapperHeight: CANVAS_HEIGHT + SCROLLBAR_RESERVED,
        timePxRatio: wrapperWidth / this.props.duration,
        freqPxRatio: CANVAS_HEIGHT / this.props.frequencyRange,
      });
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

    return offset / this.state.timePxRatio;
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

    return this.props.startFrequency + offset / this.state.freqPxRatio;
  }

  seekTo = (event: SyntheticPointerEvent<HTMLCanvasElement>) => {
    this.props.onSeek(this.getTimeFromClientX(event.clientX));
  }

  onWheelZoom = (event: SyntheticWheelEvent<HTMLCanvasElement>) => {
    if (event.deltaY < 0) {
      // Zoom in
      this.zoom(1);
    } else if (event.deltaY > 0) {
      // Zoom out
      this.zoom(-1);
    }
  }

  zoom = (direction: number) => {
    const canvas: HTMLCanvasElement = this.canvasRef.current;
    const oldZoomIdx: number = this.props.zoomLevels.findIndex(factor => factor === this.state.zoomFactor);

    let newZoom: number = this.state.zoomFactor;

    if (direction > 0 && oldZoomIdx < this.props.zoomLevels.length - 1) {
      // Zoom in
      newZoom = this.props.zoomLevels[oldZoomIdx+1];
    } else if (direction < 0 && oldZoomIdx > 0) {
      // Zoom out
      newZoom = this.props.zoomLevels[oldZoomIdx-1];
    }

    canvas.width = this.state.wrapperWidth * newZoom;

    // const wrapper: HTMLElement = this.wrapperRef.current;
    // wrapper.scrollLeft = event.clientX * newZoom / 2;

    this.setState({
      zoomFactor: newZoom,
      timePxRatio: this.state.wrapperWidth * newZoom / this.props.duration,
    });
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
      active: false,
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
      active: false,
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

    // Draw spectro images
    const spectrograms = this.state.spectrograms.get(this.state.zoomFactor);
    if (spectrograms) {
      spectrograms.forEach(spectro => {
        if (spectro.image) {
          const x = spectro.start * this.state.timePxRatio;
          const width = (spectro.end - spectro.start) * this.state.timePxRatio;
          context.drawImage(spectro.image, x, 0, width, canvas.height);
        }
      });
    }

    // Progress bar
    const newX: number = Math.floor(canvas.width * this.props.currentTime / this.props.duration);
    context.fillStyle = 'rgba(0, 0, 0)';
    context.fillRect(newX, 0, 1, canvas.height);

    // Render new annotation
    if (this.state.newAnnotation) {
      const ann: Annotation = this.state.newAnnotation;
      const x: number = Math.floor(ann.startTime * this.state.timePxRatio);
      const y: number = Math.floor(canvas.height - ann.startFrequency * this.state.freqPxRatio);
      const width: number = Math.floor((ann.endTime - ann.startTime) * this.state.timePxRatio);
      const height: number = - Math.floor((ann.endFrequency - ann.startFrequency) * this.state.freqPxRatio);
      context.strokeStyle = 'blue';
      context.strokeRect(x, y, width, height);
    }
  }

  render() {
    const style = {
      workbench: {
        height: `${CONTROLS_AREA_SIZE + CANVAS_HEIGHT + SCROLLBAR_RESERVED + X_AXIS_SIZE}px`
      },
      wrapper: {
        top: `${CONTROLS_AREA_SIZE}px`,
        height: `${this.state.wrapperHeight}px`,
        width: `${this.state.wrapperWidth}px`,
      },
      canvas: {
        top: 0,
        left: 0,
      }
    };

    return (
      <div
        className="workbench rounded col-sm-12"
        ref={this.initSizes}
        style={style.workbench}
      >
        <p className="workbench-controls">
          <button className="btn-simple fa fa-search-plus" onClick={() => this.zoom(1)}></button>
          <button className="btn-simple fa fa-search-minus" onClick={() => this.zoom(-1)}></button>
          <span>{this.state.zoomFactor}x</span>
        </p>

        <div
          className="canvas-wrapper"
          ref={this.wrapperRef}
          style={style.wrapper}
        >
          <canvas
            className="canvas"
            ref={this.canvasRef}
            height={CANVAS_HEIGHT}
            width={CANVAS_WIDTH}
            style={style.canvas}
            onClick={this.seekTo}
            onPointerDown={this.onStartNewAnnotation}
            onWheel={this.onWheelZoom}
          ></canvas>

          {this.props.annotations.map(annotation => this.renderRegion(annotation))}
        </div>
      </div>
    );
  }

  renderRegion = (ann: Annotation) => {
    // Top offset
    const offsetTop: number = CANVAS_HEIGHT - ann.endFrequency * this.state.freqPxRatio;

    // Left offset
    const offsetLeft: number = ann.startTime * this.state.timePxRatio;

    return (
      <Region
        key={ann.id}
        annotation={ann}
        color={utils.getTagColor(this.props.tagColors, ann.annotation)}
        timePxRatio={this.state.timePxRatio}
        freqPxRatio={this.state.freqPxRatio}
        offsetTop={offsetTop}
        offsetLeft={offsetLeft}
        onRegionDeleted={this.props.onAnnotationDeleted}
        onRegionMoved={this.props.onAnnotationUpdated}
        onRegionPlayed={this.props.onAnnotationPlayed}
        onRegionClicked={this.props.onAnnotationSelected}
       ></Region>
    );
  }
}

export default Workbench;
