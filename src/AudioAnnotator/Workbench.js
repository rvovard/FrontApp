// @flow
import React, { Component } from 'react';
import * as utils from '../utils';

import type { Annotation } from './AudioAnnotator';
import Region from './Region';

// Component dimensions constants
const CANVAS_HEIGHT: number = 512;
const CANVAS_WIDTH: number = 950;
const CONTROLS_AREA_SIZE: number = 80;
const TIME_AXIS_SIZE: number = 30;
const FREQ_AXIS_SIZE: number = 35;
const SCROLLBAR_RESERVED: number = 20;

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
   * Ref to canvas is used to modify its width and height properties, and to get its context.
   * @property {any} canvasRef React reference to the canvas
   */
  canvasRef: any;

  timeAxisRef: any;
  freqAxisRef: any;

  isDrawing: boolean;
  drawPxMove: number;
  drawStartTime: number;
  drawStartFrequency: number;

  constructor(props: WorkbenchProps) {
    super(props);

    this.state = {
      wrapperWidth: CANVAS_WIDTH,
      wrapperHeight: CANVAS_HEIGHT + TIME_AXIS_SIZE + SCROLLBAR_RESERVED,
      zoomFactor: 1,
      timePxRatio: CANVAS_WIDTH / props.duration,
      freqPxRatio: CANVAS_HEIGHT / props.frequencyRange,
      spectrogram: undefined,
      spectrograms: new Map(),
      newAnnotation: undefined,
    };

    this.wrapperRef = React.createRef();
    this.canvasRef = React.createRef();
    this.timeAxisRef = React.createRef();
    this.freqAxisRef = React.createRef();

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
    this.renderTimeAxis();
    this.renderFreqAxis();
  }

  componentWillUnmount() {
    document.removeEventListener('pointermove', this.onUpdateNewAnnotation);
    document.removeEventListener('pointerup', this.onEndNewAnnotation);
  }

  initSizes = (workbench: ?HTMLElement) => {
    if (workbench) {
      const bounds: ClientRect = workbench.getBoundingClientRect();
      const wrapperWidth: number = Math.floor(bounds.width - FREQ_AXIS_SIZE);

      const canvas: HTMLCanvasElement = this.canvasRef.current;
      const timeAxis: HTMLCanvasElement = this.timeAxisRef.current;

      // Adapt width to available space
      canvas.width = wrapperWidth;
      timeAxis.width = wrapperWidth;

      // Force height
      canvas.height = CANVAS_HEIGHT;
      timeAxis.height = TIME_AXIS_SIZE;

      this.setState({
        wrapperWidth: wrapperWidth,
        wrapperHeight: CANVAS_HEIGHT + TIME_AXIS_SIZE + SCROLLBAR_RESERVED,
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
    const timeAxis: HTMLCanvasElement = this.timeAxisRef.current;

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
    timeAxis.width = this.state.wrapperWidth * newZoom;

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

  renderTimeAxis = () => {
    const timeAxis: HTMLCanvasElement = this.timeAxisRef.current;
    const context: CanvasRenderingContext2D = timeAxis.getContext('2d');
    const bounds: ClientRect = timeAxis.getBoundingClientRect();

    let step: number = 1; // step of scale (in seconds)
    let bigStep: number = 5;

    const durationOnScreen: number = this.state.wrapperWidth / this.state.timePxRatio;
    if (durationOnScreen <= 60) {
      step = 1;
      bigStep = 5;
    } else if (durationOnScreen > 60 && durationOnScreen <= 120) {
      step = 2;
      bigStep = 5;
    } else if (durationOnScreen > 120 && durationOnScreen <= 240) {
      step = 4;
      bigStep = 5;
    } else {
      step = 10;
      bigStep = 6;
    }

    const startTime: number = Math.ceil(this.getTimeFromClientX(bounds.left));
    const endTime: number = Math.floor(this.getTimeFromClientX(bounds.right));

    context.fillStyle = 'rgba(0, 0, 0)';

    let i: number = 0;
    for (i = startTime ; i <= endTime; i++) {
      if (i % step === 0) {
        const x: number = (i - startTime) * this.state.timePxRatio;
        let xTxt: number = x - 25;
        if (xTxt < 0) {
          xTxt += 25;
        } else if (xTxt >= (bounds.width - 30)) {
          xTxt -= 25;
        }

        if (i % bigStep === 0) {
          context.fillRect(x, 0, 2, 15);
          context.fillText(this.formatTimestamp(i), xTxt, 25);
        } else {
          context.fillRect(x, 0, 1, 10);
        }
      }
    }
  }

  renderFreqAxis = () => {
    const freqAxis: HTMLCanvasElement = this.freqAxisRef.current;
    const context: CanvasRenderingContext2D = freqAxis.getContext('2d');

    const step: number = 500; // step of scale (in hz)
    const bigStep: number = 2000;

    const startFreq: number = Math.ceil(this.props.startFrequency);
    const endFreq: number = Math.floor(this.props.startFrequency + this.props.frequencyRange);
    context.fillStyle = 'rgba(0, 0, 0)';

    let i: number = 0;
    for (i = startFreq ; i <= endFreq ; i += 100) {
      if (i % step === 0) {
        const y: number = CANVAS_HEIGHT - (i - startFreq) * this.state.freqPxRatio - 2;
        let yTxt: number = y - 3;

        if (i % bigStep === 0) {
          context.fillRect(FREQ_AXIS_SIZE - 15, y, 15, 2);
          context.fillText(i.toString(), 0, yTxt);
        } else {
          context.fillRect(FREQ_AXIS_SIZE - 10, y, 10, 1);
        }
      }
    }
  }

  strPad = (nb: number) => {
    if (nb < 10) {
      return '0' + nb.toFixed(0);
    } else {
      return nb.toFixed(0);
    }
  }

  formatTimestamp = (rawSeconds: number) => {
    const minutes: number = Math.floor(rawSeconds / 60) % 60;
    const seconds: number = Math.floor(rawSeconds) % 60;

    return this.strPad(minutes) + 'min' + this.strPad(seconds) + 's';
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
        height: `${CONTROLS_AREA_SIZE + CANVAS_HEIGHT + TIME_AXIS_SIZE + SCROLLBAR_RESERVED}px`
      },
      wrapper: {
        top: `${CONTROLS_AREA_SIZE}px`,
        height: `${this.state.wrapperHeight}px`,
        width: `${this.state.wrapperWidth}px`,
      },
      canvas: {
        top: 0,
        left: 0,
      },
      timeAxis: {
        top: `${CANVAS_HEIGHT}px`,
        left: 0,
      },
      freqAxis: {
        top: `${CONTROLS_AREA_SIZE}px`,
        left: 0,
      },
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

        <canvas
          className="freq-axis"
          ref={this.freqAxisRef}
          height={CANVAS_HEIGHT}
          width={FREQ_AXIS_SIZE}
          style={style.freqAxis}
        ></canvas>
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

          <canvas
            className="time-axis"
            ref={this.timeAxisRef}
            height={TIME_AXIS_SIZE}
            width={CANVAS_WIDTH}
            style={style.timeAxis}
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
