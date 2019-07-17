// @flow
import React, { Component } from 'react';

import AudioPlayer from './AudioPlayer';

import './css/font-awesome-4.7.0.min.css';
import './css/annotator.css';

type AnnotatorProps = {
  match: {
    params: {
      annotation_task_id: number
    },
  },
  app_token: string,
  src: string,
};

type AnnotatorState = {
  isLoading: boolean,
  isPlaying: boolean,
  currentTime: number,
  duration: number,
  progress: number,
};

class Annotator extends Component<AnnotatorProps, AnnotatorState> {
  audioContext: AudioContext;
  audioPlayer: AudioPlayer;

  canvasRef: any;

  constructor(props: AnnotatorProps) {
    super(props);
    this.state = {
      isLoading: false,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      progress: 0,
    };

    this.canvasRef = React.createRef();

    this.playPause = this.playPause.bind(this);
  }

  componentDidMount() {
    const canvas: HTMLCanvasElement = this.canvasRef.current;
    const context: CanvasRenderingContext2D = canvas.getContext('2d');
    context.fillStyle = 'rgba(200, 200, 200)';
    context.fillRect(0, 0, canvas.width, canvas.height);
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
    const progress = (seconds / this.audioPlayer.audioElement.duration) * 100;
    this.setState({
      currentTime: seconds,
      duration: this.audioPlayer.audioElement.duration,
      progress,
    });
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
      + ms.toFixed(3).substring(2);
  }

  render() {
    const playStatusClass = this.state.isPlaying ? "fa-pause-circle" : "fa-play-circle";
    
    if (this.state.isLoading) {
      return <p>Chargement en cours</p>;
    } else {
      return (
        <div className="annotator">
          <AudioPlayer
            controls
            listenInterval={500}
            onListen={(seconds) => this.updateProgress(seconds)}
            onLoadedMetadata={() => this.updateProgress(0)}
            preload="auto"
            ref={(element) => { this.audioPlayer = element; } }
            src={this.props.src}
          ></AudioPlayer>

          <canvas
            width="600" height="200"
            ref={this.canvasRef}
            className="canvas"
          ></canvas>

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

export default Annotator;
