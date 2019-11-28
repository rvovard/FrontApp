// @flow
import * as React from 'react';

// Constants
const AVAILABLE_RATES: Array<number> = [0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0];


type AudioManagerProps = {
  className: string,
  listenInterval: number,
  onError: any,
  onListen: any,
  duration: number,
  sampleRate: number,
  source: string,
};

type AudioManagerState = {
  isLoading: boolean,
  isPlaying: boolean,
  audioContextStartTime: number,
  startTime: number,
  playbackRate: number,
}

class AudioManager extends React.Component<AudioManagerProps, AudioManagerState> {

  audioContext: AudioContext;
  source: AudioBufferSourceNode;
  buffer: ?AudioBuffer;
  nextBuffer: ?AudioBuffer;

  listenTracker: any;

  static defaultProps = {
    className: '',
    listenInterval: 1000,
    onError: () => {},
    onListen: () => {},
  };

  constructor(props: AudioManagerProps) {
    super(props);

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.buffer = null;

    this.state = {
      isLoading: true,
      isPlaying: false,
      audioContextStartTime: 0,
      startTime: 0,
      playbackRate: 1.0,
    };
  }

  supportsWebAudio(): boolean {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  componentDidMount() {
    this.loadFile(this.props.source, this.props.sampleRate, this.props.duration);
  }

  componentWillUnmount() {
    this.clearListenTracker();
  }

  /**
   * Request and decode the given file using an OfflineAudioContext.
   * @param {string} url Url for the file
   * @param {sampleRate} sampleRate Sample rate for the file
   * @param {number} duration File duration
   */
  loadFile = (url: string, sampleRate: number, duration: number) => {
    let request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';

    request.onload = () => {
      let offlineAudioContext = new (window.OfflineAudioContext ||
        window.webkitOfflineAudioContext)(1, sampleRate * duration, sampleRate);

      offlineAudioContext.decodeAudioData(
        request.response,
        (buffer: AudioBuffer) => {
          this.buffer = buffer;
          this.setState({isLoading: false});
        },
        () => { this.props.onError('Error during audio data decoding'); }
      );
    }

    request.send();
  }

  /**
   * Set an interval to call props.onListen every props.listenInterval time period
   */
  setListenTracker = () => {
    if (!this.listenTracker) {
      this.listenTracker = setInterval(() => {
        this.props.onListen(this.getCurrentTime());
      }, this.props.listenInterval);
    }
  }

  /**
   * Clear the onListen interval
   */
  clearListenTracker = () => {
    if (this.listenTracker) {
      clearInterval(this.listenTracker);
      this.listenTracker = null;
    }
  }

  /**
   * (Re)Create the source (AudioBuffer)
   */
  createSource = () => {
    if (this.source) {
      this.source.disconnect();
    }

    if (this.buffer) {
      const buffer = this.buffer;

      this.source = this.audioContext.createBufferSource();
      this.source.playbackRate.setValueAtTime(this.state.playbackRate, this.audioContext.currentTime);
      this.source.buffer = buffer;
      this.source.connect(this.audioContext.destination);
    }
  }

  getPlayedTime: (void => number) = () => {
    return (this.audioContext.currentTime - this.state.audioContextStartTime) * this.state.playbackRate;
  }

  getCurrentTime: (void => number) = () => {
    if (this.state.isPlaying) {
      return this.state.startTime + this.getPlayedTime();
    } else {
      return this.state.startTime;
    }
  }

  sanitizePlayBounds = (wantedStart: ?number, wantedEnd: ?number): {start: number, end: number} => {
    let start: number = this.state.startTime;
    if (typeof wantedStart === 'number' && wantedStart > 0 && wantedStart < this.props.duration) {
      start = wantedStart;
    }

    let end: number = this.props.duration;
    if (typeof wantedEnd === 'number' && wantedEnd > start && wantedEnd < this.props.duration) {
      end = wantedEnd;
    }

    return {start, end};
  }

  seekTo = (seekedTime: number) => {
    let startTime: number = this.sanitizePlayBounds(seekedTime).start;

    if (this.state.isPlaying) {
      this.setState({startTime}, this.play);
    } else {
      this.setState({startTime});
    }
  }

  playPause = () => {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play = (forcedStart: ?number, forcedEnd: ?number) => {
    if (!this.state.isLoading && this.buffer) {
      // Need to re-create source on each playback
      this.createSource();

      // Listen to the 'onended' event
      this.source.addEventListener('ended', this.pause);

      // Keep track of audio context current timer for future calculations
      const audioContextStartTime: number = this.audioContext.currentTime;

      // Compute start and end time
      const bounds: {start: number, end: number} = this.sanitizePlayBounds(forcedStart, forcedEnd);

      // Start source immediately
      this.source.start(0, bounds.start, bounds.end - bounds.start);

      // Set listen tracker to inform parent component
      this.setListenTracker();

      // Finally, set state with useful data
      this.setState({
        isPlaying: true,
        audioContextStartTime,
        startTime: bounds.start,
      });
    }
  }

  pause = () => {
    if (!this.state.isLoading) {
      this.clearListenTracker();

      const startTime: number = this.getCurrentTime();
      this.source.stop(0);

      this.setState({
        isPlaying: false,
        startTime,
      });
    }
  }

  onPlaybackRateChange = (event: SyntheticInputEvent<HTMLSelectElement>) => {
    const newRate: number = parseFloat(event.target.value);

    if (this.state.isPlaying) {
      const startTime: number = this.state.startTime + this.getPlayedTime();
      this.source.removeEventListener('ended', this.pause);
      this.source.stop(0);

      this.setState({
        playbackRate: newRate,
        startTime,
      }, this.play);
    } else {
      this.setState({playbackRate: newRate});
    }
  }

  render() {
    let playStatusClass = 'fa-play-circle';
    if (this.state.isLoading) {
      playStatusClass = 'fa-spin fa-spinner';
    } else if (this.state.isPlaying) {
      playStatusClass = 'fa-pause-circle';
    }

    return (
      <div className={`audio-player ${this.props.className}`}>
        <button
          className={`btn-simple btn-play fa ${playStatusClass}`}
          disabled={this.state.isLoading}
          onClick={this.playPause}
        ></button>
        {this.renderRateSelect()}
      </div>
    );
  }

  renderRateSelect() {
    const playbackRateOptions = AVAILABLE_RATES.map(rate => (
      <option key={`rate-${rate}`} value={rate.toString()}>{rate.toString()}x</option>
    ));

    return (
      <select
        className="form-control select-rate"
        defaultValue={this.state.playbackRate}
        disabled={this.state.isLoading}
        onChange={this.onPlaybackRateChange}
      >{playbackRateOptions}</select>
    );
  }
}

export default AudioManager;
