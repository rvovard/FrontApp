// @flow
import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import request from 'superagent';

import AudioPlayer from './AudioPlayer';

import './css/font-awesome-4.7.0.min.css';
import './css/annotator.css';

// API constants
if (!process.env.REACT_APP_API_URL) throw new Error('REACT_APP_API_URL missing in env');
const API_URL = process.env.REACT_APP_API_URL + '/annotation-task';

// Component dimensions constants
const WORKBENCH_HEIGHT: number = 600;
const WORKBENCH_WIDTH: number = 1000;
const LABELS_AREA_SIZE: number = 100;
const X_AXIS_SIZE: number = 30;
const Y_AXIS_SIZE: number = 30;


type AnnotationTask = {
  annotationTags: Array<string>,
  boundaries: {
    startTime: string,
    endTime: string,
    startFrequency: number,
    endFrequency: number,
  },
  audioUrl: string,
  spectroUrls: any,
};

type Annotation = {
  id: string,
  annotation: string,
  startTime: number,
  endTime: number,
  startFrequency: number,
  endFrequency: number,
};

type AudioAnnotatorProps = {
  match: {
    params: {
      annotation_task_id: number
    },
  },
  app_token: string,
};

type AudioAnnotatorState = {
  error: ?string,
  height: number,
  width: number,
  isLoading: boolean,
  isPlaying: boolean,
  currentTime: number,
  duration: number,
  frequencyRange: number,
  task: ?AnnotationTask,
  spectrogram: ?Image,
  annotations: Array<Annotation>,
  newAnnotation: ?Annotation,
};

class AudioAnnotator extends Component<AudioAnnotatorProps, AudioAnnotatorState> {
  audioContext: AudioContext;
  audioPlayer: AudioPlayer;

  canvasRef: any;
  isDrawing: boolean;
  startDrawTime: number;
  startDrawFrequency: number;

  constructor(props: AudioAnnotatorProps) {
    super(props);

    this.state = {
      error: undefined,
      height: WORKBENCH_HEIGHT,
      width: WORKBENCH_WIDTH,
      isLoading: true,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      frequencyRange: 0,
      task: undefined,
      spectrogram: undefined,
      annotations: [],
      newAnnotation: undefined,
    };

    this.canvasRef = React.createRef();
    this.isDrawing = false;
    this.startDrawTime = 0;
    this.startDrawFrequency = 0;
  }

  componentDidMount() {
    const taskId: number = this.props.match.params.annotation_task_id;

    // Retrieve current task
    request.get(API_URL + '/' + taskId.toString())
      .set('Authorization', 'Bearer ' + this.props.app_token)
      .then(result => {
        const task: AnnotationTask = result.body.task;

        // Handling spectrogram image
        const spectrogram = new Image();
        spectrogram.onload = this.renderCanvas;
        spectrogram.src = task.spectroUrls['100%'];

        // Computing duration (in seconds)
        const startDate = new Date(task.boundaries.startTime);
        const endDate = new Date(task.boundaries.endTime)
        const duration: number = (endDate.getTime() - startDate.getTime()) / 1000;
        const frequencyRange: number = task.boundaries.endFrequency - task.boundaries.startFrequency;

        // Finally, setting state
        this.setState({
          task,
          duration,
          frequencyRange,
          isLoading: false,
          error: undefined,
          spectrogram,
        });
      })
      .catch(err => {
        if (err.status && err.status === 401) {
          // Server returned 401 which means token was revoked
          document.cookie = 'token=;max-age=0';
          window.location.reload();
        } else {
          this.setState({isLoading: false, error: this.buildErrorMessage(err)});
        }
      });
  }

  buildErrorMessage = (err: any) => {
    return 'Status: ' + err.status.toString() +
      ' - Reason: ' + err.message +
      (err.response.body.title ? ` - ${err.response.body.title}` : '') +
      (err.response.body.detail ? ` - ${err.response.body.detail}` : '');
  }

  initSizes = (wrapper: ?HTMLElement) => {
    if (wrapper) {
      const bounds: ClientRect = wrapper.getBoundingClientRect();
      this.setState({width: bounds.width});

      const canvas: HTMLCanvasElement = this.canvasRef.current;
      canvas.height = this.state.height - LABELS_AREA_SIZE - Y_AXIS_SIZE;
      canvas.width = bounds.width - X_AXIS_SIZE;
    }
  }

  getTimeFromOffset = (clientX: number) => {
    const canvas: HTMLCanvasElement = this.canvasRef.current;
    const bounds: ClientRect = canvas.getBoundingClientRect();

    // Offset: nb of pixels from the axis (left)
    let offset: number = clientX - bounds.left;
    if (clientX < bounds.left) {
      offset = 0;
    } else if (clientX > bounds.right) {
      offset = canvas.width;
    }

    return this.state.duration * offset / canvas.width;
  }

  getFrequencyFromOffset = (clientY: number) => {
    const canvas: HTMLCanvasElement = this.canvasRef.current;
    const bounds: ClientRect = canvas.getBoundingClientRect();

    // Offset: nb of pixels from the axis (bottom)
    let offset: number = bounds.bottom - clientY;
    if (clientY < bounds.top) {
      offset = canvas.height;
    } else if (clientY > bounds.bottom) {
      offset = 0;
    }

    const minFreq: number = this.state.task ? this.state.task.boundaries.startFrequency : 0;
    return minFreq + this.state.frequencyRange * offset / canvas.height;
  }

  seekTo = (event: SyntheticMouseEvent<HTMLCanvasElement>) => {
    const newTime = this.getTimeFromOffset(event.clientX);
    this.audioPlayer.audioElement.currentTime = newTime;
    this.updateProgress(newTime);
  }

  onStartNewAnnotation = (event: SyntheticPointerEvent<HTMLCanvasElement>) => {
    const newTime: number = this.getTimeFromOffset(event.clientX);
    const newFrequency: number = this.getFrequencyFromOffset(event.clientY);

    this.isDrawing = true;
    this.startDrawTime = newTime;
    this.startDrawFrequency = newFrequency;

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

  computeNewAnnotation = (event: SyntheticPointerEvent<HTMLElement>) => {
    const currentTime: number = this.getTimeFromOffset(event.clientX);
    const currentFrequency: number = this.getFrequencyFromOffset(event.clientY);

    const newAnnotation: Annotation = {
      id: '',
      annotation: '',
      startTime: Math.min(currentTime, this.startDrawTime),
      endTime: Math.max(currentTime, this.startDrawTime),
      startFrequency: Math.min(currentFrequency, this.startDrawFrequency),
      endFrequency: Math.max(currentFrequency, this.startDrawFrequency),
    };
    return newAnnotation;
  }

  onUpdateNewAnnotation = (event: SyntheticPointerEvent<HTMLElement>) => {
    if (this.isDrawing) {
      const newAnnotation: Annotation = this.computeNewAnnotation(event);
      this.setState({newAnnotation});
    }
  }

  onEndNewAnnotation = (event: SyntheticPointerEvent<HTMLElement>) => {
    if (this.isDrawing) {
      const maxId: ?number = this.state.annotations
        .map(annotation => parseInt(annotation.id, 10))
        .sort((a, b) => b - a)
        .shift();

      const newAnnotation: Annotation = Object.assign(
        {},
        this.computeNewAnnotation(event),
        { id: maxId ? (maxId + 1).toString() : '1' }
      );

      this.isDrawing = false;

      this.setState({
        annotations: this.state.annotations.concat(newAnnotation),
        newAnnotation: undefined,
      });
  }
  }

  playPause = () => {
    if (this.audioPlayer.audioElement.paused) {
      this.setState({isPlaying: true});
      this.audioPlayer.audioElement.play();
    } else {
      this.setState({isPlaying: false});
      this.audioPlayer.audioElement.pause();
    }
  }

  updateProgress = (seconds: number) => {
    this.setState({
      currentTime: seconds,
    }, this.renderCanvas);
  }

  renderCanvas = () => {
    const canvas: HTMLCanvasElement = this.canvasRef.current;
    const context: CanvasRenderingContext2D = canvas.getContext('2d');

    // Draw spectro image
    if (this.state.spectrogram) {
      context.drawImage(this.state.spectrogram, 0, 0, canvas.width, canvas.height);
    }

    // Progress bar
    const newX: number = Math.floor(this.state.currentTime / this.state.duration * canvas.width);
    context.fillStyle = 'rgba(0, 0, 0)';
    context.fillRect(newX, 0, 1, canvas.height);

    // New annotation
    // @todo continue here
  }

  strPad = (nb: number) => {
    if (nb < 10) {
      return '0' + nb.toFixed(0);
    } else {
      return nb.toFixed(0);
    }
  }

  formatTimestamp = (rawSeconds: number) => {
    const hours: number = Math.floor(rawSeconds / 3600);
    const minutes: number = Math.floor(rawSeconds / 60) % 60;
    const seconds: number = Math.floor(rawSeconds) % 60;
    const ms: number = rawSeconds - seconds;

    return this.strPad(hours) + ':'
      + this.strPad(minutes) + ':'
      + this.strPad(seconds) + '.'
      + ms.toFixed(3).slice(-3);
  }

  render() {
    if (this.state.isLoading) {
      return <p>Loading...</p>;
    } else if (this.state.error) {
      return <p>Error while loading task: <code>{this.state.error}</code></p>
    } else if (!this.state.task) {
      return <p>Unknown error while loading task.</p>
    } else {
      const playStatusClass = this.state.isPlaying ? "fa-pause-circle" : "fa-play-circle";
      const styles = {
        workbench: {
          height: this.state.height,
          width: this.state.width,
        },
        canvas: {
          top: LABELS_AREA_SIZE,
          left: Y_AXIS_SIZE,
        },
      };

      return (
        <div
          className="annotator"
          onPointerMove={this.onUpdateNewAnnotation}
          onPointerUp={this.onEndNewAnnotation}
          ref={this.initSizes}
        >
          <p><Link to={'/audio-annotator/legacy/' + this.props.match.params.annotation_task_id}>
            <button className="btn btn-submit" type="button">Switch to old annotator</button>
          </Link></p>

          <AudioPlayer
            // controls
            listenInterval={10}
            onListen={(seconds) => this.updateProgress(seconds)}
            onLoadedMetadata={() => this.updateProgress(0)}
            preload="auto"
            ref={(element) => { if (element) this.audioPlayer = element; } }
            src={this.state.task.audioUrl}
          ></AudioPlayer>

          <div
            className="workbench"
            style={styles.workbench}
          >
            <canvas
              className="canvas"
              ref={this.canvasRef}
              height={WORKBENCH_HEIGHT - LABELS_AREA_SIZE - X_AXIS_SIZE}
              width={WORKBENCH_WIDTH - Y_AXIS_SIZE}
              style={styles.canvas}
              onClick={this.seekTo}
              onPointerDown={this.onStartNewAnnotation}
              onPointerMove={this.onUpdateNewAnnotation}
              onPointerUp={this.onEndNewAnnotation}
            ></canvas>
          </div>

          <div className="controls">
            <button
              className={`btn-play fa ${playStatusClass}`}
              onClick={this.playPause}
            ></button>

            <p className="timestamps">
              {this.formatTimestamp(this.state.currentTime)}
              /
              {this.formatTimestamp(this.state.duration)}
            </p>
          </div>

          <table className="annotations">
            <tbody>
              {this.state.annotations.map(annotation => this.renderAnnotation(annotation))}
            </tbody>
          </table>
        </div>
      );
    }
  }

  renderAnnotation = (annotation: Annotation) => {
    return (
      <tr key={annotation.id}>
        <td>{annotation.id}</td>
        <td>
          {this.formatTimestamp(annotation.startTime)} &gt; {this.formatTimestamp(annotation.endTime)}
        </td>
        <td>
          {annotation.startFrequency.toFixed(2)} &gt; {annotation.endFrequency.toFixed(2)} Hz
        </td>
        <td>{annotation.annotation}</td>
      </tr>
    );
  }
}

export default AudioAnnotator;
