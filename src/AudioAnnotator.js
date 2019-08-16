// @flow
import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import request from 'superagent';

import AudioPlayer from './AudioPlayer';
import Workbench from './Workbench';

import './css/font-awesome-4.7.0.min.css';
import './css/annotator.css';

// API constants
if (!process.env.REACT_APP_API_URL) throw new Error('REACT_APP_API_URL missing in env');
const API_URL = process.env.REACT_APP_API_URL + '/annotation-task';


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

export type Annotation = {
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
  isLoading: boolean,
  isPlaying: boolean,
  currentTime: number,
  duration: number,
  frequencyRange: number,
  task: ?AnnotationTask,
  annotations: Array<Annotation>,
};

class AudioAnnotator extends Component<AudioAnnotatorProps, AudioAnnotatorState> {
  audioContext: AudioContext;
  audioPlayer: AudioPlayer;

  constructor(props: AudioAnnotatorProps) {
    super(props);

    this.state = {
      error: undefined,
      isLoading: true,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      frequencyRange: 0,
      task: undefined,
      annotations: [],
    };
  }

  componentDidMount() {
    const taskId: number = this.props.match.params.annotation_task_id;

    // Retrieve current task
    request.get(API_URL + '/' + taskId.toString())
      .set('Authorization', 'Bearer ' + this.props.app_token)
      .then(result => {
        const task: AnnotationTask = result.body.task;

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

  seekTo = (newTime: number) => {
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
    this.setState({
      currentTime: seconds,
    });
  }

  saveAnnotation = (annotation: Annotation) => {
    const maxId: ?number = this.state.annotations
      .map(ann => parseInt(ann.id, 10))
      .sort((a, b) => b - a)
      .shift();

    const newAnnotation: Annotation = Object.assign(
      {},
      annotation,
      { id: maxId ? (maxId + 1).toString() : '1' }
    );

    this.setState({
      annotations: this.state.annotations.concat(newAnnotation),
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

      return (
        <div className="annotator">
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

          <Workbench
            currentTime={this.state.currentTime}
            duration={this.state.duration}
            startFrequency={this.state.task.boundaries.startFrequency}
            frequencyRange={this.state.frequencyRange}
            spectrogramUrl={this.state.task.spectroUrls['100%']}
            annotations={this.state.annotations}
            onAnnotationCreated={this.saveAnnotation}
            onSeek={this.seekTo}
          >
          </Workbench>

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
