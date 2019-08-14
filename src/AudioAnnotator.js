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
  progress: number,
  task: ?AnnotationTask,
  spectrogram: ?Image,
};

class AudioAnnotator extends Component<AudioAnnotatorProps, AudioAnnotatorState> {
  audioContext: AudioContext;
  audioPlayer: AudioPlayer;

  canvasRef: any;

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
      progress: 0,
      task: undefined,
      spectrogram: undefined,
    };

    this.canvasRef = React.createRef();
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

        // Finally, setting state
        this.setState({
          task,
          duration,
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

  seekTo = (event: SyntheticMouseEvent<HTMLCanvasElement>) => {
    const newTime = Math.floor(this.state.duration * event.nativeEvent.offsetX / event.currentTarget.width);
    this.audioPlayer.audioElement.currentTime = newTime;
    this.updateProgress(newTime);
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
    const progress = seconds / this.state.duration;
    this.setState({
      currentTime: seconds,
      progress,
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
    const newX: number = Math.floor(this.state.progress * canvas.width);
    context.fillStyle = 'rgba(0, 0, 0)';
    context.fillRect(newX, 0, 1, canvas.height);
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
        <div className="annotator" ref={this.initSizes}>
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

          <div className="workbench" style={styles.workbench}>
            <canvas
              className="canvas"
              ref={this.canvasRef}
              height={WORKBENCH_HEIGHT - LABELS_AREA_SIZE - X_AXIS_SIZE}
              width={WORKBENCH_WIDTH - Y_AXIS_SIZE}
              style={styles.canvas}
              onClick={this.seekTo}
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
        </div>
      );
    }
  }
}

export default AudioAnnotator;
