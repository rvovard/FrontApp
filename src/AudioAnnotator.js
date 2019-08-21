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
  active: boolean;
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
  stopTime: ?number,
  currentTime: number,
  duration: number,
  frequencyRange: number,
  task: ?AnnotationTask,
  taskStartTime: number,
  annotations: Array<Annotation>,
};

class AudioAnnotator extends Component<AudioAnnotatorProps, AudioAnnotatorState> {
  audioContext: AudioContext;
  audioPlayer: AudioPlayer;

  constructor(props: AudioAnnotatorProps) {
    super(props);

    const now: Date = new Date();

    this.state = {
      error: undefined,
      isLoading: true,
      isPlaying: false,
      stopTime: undefined,
      currentTime: 0,
      duration: 0,
      frequencyRange: 0,
      task: undefined,
      taskStartTime: now.getTime(),
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
      this.play();
    } else {
      this.pause();
    }
  }

  play = (annotation: ?Annotation) => {
    if (annotation) {
      this.audioPlayer.audioElement.currentTime = annotation.startTime;
      this.activateAnnotation(annotation);
    }
    this.audioPlayer.audioElement.play();

    this.setState({
      isPlaying: true,
      stopTime: annotation ? annotation.endTime : undefined,
    });
  }

  pause = () => {
    this.audioPlayer.audioElement.pause();

    this.setState({
      isPlaying: false,
      stopTime: undefined,
    });
  }

  updateProgress = (seconds: number) => {
    if (this.state.stopTime && (seconds > this.state.stopTime)) {
      this.pause();
    } else {
      this.setState({currentTime: seconds});
    }
  }

  saveAnnotation = (annotation: Annotation) => {
    const maxId: ?number = this.state.annotations
      .map(ann => parseInt(ann.id, 10))
      .sort((a, b) => b - a)
      .shift();

    const newAnnotation: Annotation = Object.assign(
      {}, annotation, { id: maxId ? (maxId + 1).toString() : '1' }
    );

    this.activateAnnotation(newAnnotation);
  }

  updateAnnotation = (annotation: Annotation) => {
    const annotations: Array<Annotation> = this.state.annotations
      .filter(ann => ann.id !== annotation.id)
      .concat(annotation);

    this.setState({annotations});
  }

  deleteAnnotation = (annotation: Annotation) => {
    const annotations: Array<Annotation> = this.state.annotations
      .filter(ann => ann.id !== annotation.id);

    this.setState({annotations});
  }

  activateAnnotation = (annotation: Annotation) => {
    const activated: Annotation = Object.assign(
      {}, annotation, { active: true }
    );
    const annotations: Array<Annotation> = this.state.annotations
      .filter(ann => ann.id !== activated.id)
      .map(ann => Object.assign({}, ann, { active: false }))
      .concat(activated)
      .sort((a, b) => a.startTime - b.startTime);

    this.setState({annotations});
  }

  toggleTag = (tag: string) => {
    const activeAnn: ?Annotation = this.state.annotations
      .find(ann => ann.active);

    if (activeAnn) {
      const newTag: string = (activeAnn.annotation === tag) ? '' : tag;
      const newAnnotation: Annotation = Object.assign(
        {}, activeAnn, { annotation: newTag, }
      );
      const annotations: Array<Annotation> = this.state.annotations
        .filter(ann => !ann.active)
        .concat(newAnnotation);

      this.setState({annotations});
    }
  }

  submitAnnotations = () => {
    const taskId: number = this.props.match.params.annotation_task_id;

    const cleanAnnotations = this.state.annotations.map(ann => {
      return {
        id: ann.id,
        start: ann.startTime,
        end: ann.endTime,
        startFrequency: ann.startFrequency,
        endFrequency: ann.endFrequency,
      };
    });
    const now: Date = new Date();
    const taskStartTime: number = Math.floor(this.state.taskStartTime / 1000);
    const taskEndTime: number = Math.floor(now.getTime() / 1000);

    request.post(API_URL + '/' + taskId.toString() + '/update-results')
      .set('Authorization', 'Bearer ' + this.props.app_token)
      .send({
        annotations: cleanAnnotations,
        task_start_time: taskStartTime,
        task_end_time: taskEndTime,
      })
      .then(result => {
        const nextTask: number = result.body.next_task;
        const campaignId: number = result.body.campaign_id;

        if (nextTask) {
          window.location.href = '/audio-annotator/' + nextTask.toString();
        } else {
          window.location.href = '/annotation_tasks/' + campaignId.toString();
        }
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
            onAnnotationUpdated={this.updateAnnotation}
            onAnnotationDeleted={this.deleteAnnotation}
            onAnnotationSelected={this.activateAnnotation}
            onAnnotationPlayed={this.play}
            onSeek={this.seekTo}
          >
          </Workbench>

          <div className="controls clearfix">
            <button
              className={`btn-simple btn-play fa ${playStatusClass}`}
              onClick={this.playPause}
            ></button>

            <p className="timestamps">
              {this.formatTimestamp(this.state.currentTime)}
              /
              {this.formatTimestamp(this.state.duration)}
            </p>
          </div>

          <div className="data">
            {this.renderActiveAnnotation()}
            <div className="data-all">
              <div>
                <button
                  className="btn btn-submit"
                  onClick={this.submitAnnotations}
                  type="button"
                >Submit &amp; load next recording</button>
              </div>
              <table className="annotations table table-hover">
                <tbody>
                  {this.state.annotations.map(annotation => this.renderListAnnotation(annotation))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      );
    }
  }

  renderActiveAnnotation = () => {
    const activeAnn: ?Annotation = this.state.annotations.find(ann => ann.active);

    if (activeAnn && this.state.task) {
      const ann: Annotation = activeAnn;
      const task: AnnotationTask = this.state.task;

      const tags = task.annotationTags.map((tag, idx) => (
        <button
          key={`tag${idx.toString()}`}
          className={`btn ${(ann.annotation === tag) ? 'btn-outline-primary' : 'btn-primary'}`}
          onClick={() => this.toggleTag(tag)}
          type="button"
        >{tag}</button>
      ));

      return (
        <div className="data-active">
          <p>
            Start: {this.formatTimestamp(ann.startTime)} - 
            End: {this.formatTimestamp(ann.endTime)}<br />
            Min: {ann.startFrequency.toFixed(2)} - 
            Max: {ann.endFrequency.toFixed(2)}
          </p>
          <p>{tags}</p>
        </div>
      );
    } else {
      return (
        <div className="data-active">
          <p>No selected annotation</p>
        </div>
      );
    }
  }

  renderListAnnotation = (annotation: Annotation) => {
    return (
      <tr
        key={`listann${annotation.id}`}
        onClick={() => this.activateAnnotation(annotation)}
      >
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
