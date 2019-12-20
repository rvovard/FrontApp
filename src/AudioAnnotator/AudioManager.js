// @flow
import * as React from 'react';
import * as utils from '../utils';

// Constants
const AVAILABLE_RATES: Array<number> = [0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0];
const CHUNK_DURATION: number = 60;
const CHUNKS_BUFFERED: number = 3;
const START_GAP = 0.1;

type AudioManagerProps = {
  className: string,
  listenInterval: number,
  onError: any,
  onListen: any,
  duration: number,
  sampleRate: number,
  sourceURL: string,
};

type AudioManagerState = {
  isLoading: boolean,
  isPlaying: boolean,
  startTime: number,
  endTime: number,
  playbackRate: number,
}

type Chunk = {
  buffer: AudioBuffer,
  source: ?AudioBufferSourceNode,
  isScheduled: boolean,
};

class AudioManager extends React.Component<AudioManagerProps, AudioManagerState> {

  audioContext: AudioContext;
  audioContextStartTime: number;
  chunks: Map<number, Chunk>;

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
    this.audioContextStartTime = 0;
    this.chunks = new Map();

    this.state = {
      isLoading: true,
      isPlaying: false,
      startAudioContextTime: 0,
      startTime: 0,
      endTime: this.props.duration,
      playbackRate: 1.0,
    };
  }

  supportsWebAudio(): boolean {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  componentDidMount() {
    this.handleChunksLoading();
  }

  componentWillUnmount() {
    this.clearListenTracker();
    this.unscheduleChunks();
    this.chunks.clear();
    this.audioContext.suspend();
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

  getPlayedTime: (void => number) = () => {
    return (this.audioContext.currentTime - this.audioContextStartTime) * this.state.playbackRate;
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
    if (this.state.isPlaying) {
      // Already playing, must stop and load if necessary / then reschedule
      this.play(seekedTime);
    } else {
      const startTime: number = this.sanitizePlayBounds(seekedTime).start;
      this.setState({startTime}, this.handleChunksLoading);
    }
  }

  /**
   * Compute and return chunk idx from a given time.
   * Each chunk lasts CHUNK_DURATION seconds and indexes begin at 0.
   * @param {number} time Time within the duration of the "global" sound
   * @return {number} Chunk idx
   */
  getChunkIdxFromTime = (time: number) => {
    if (time < 0 || time > this.props.duration) {
      return -1;
    } else {
      return Math.floor(time / CHUNK_DURATION);
    }
  }

  handleChunksLoading = () => {
    const curIdx: number = this.getChunkIdxFromTime(this.getCurrentTime());
    const maxIdx: number = this.getChunkIdxFromTime(this.props.duration);

    // Current and next chunk indexes to buffer
    const bufferingChunks: Array<number> = utils.range(curIdx, Math.min(curIdx + CHUNKS_BUFFERED, maxIdx));
    // Already loaded chunk indexes
    const loadedChunks: Array<number> = Array.from(this.chunks.keys());

    // If current chunk is loaded
    if (loadedChunks.includes(curIdx)) {
      if (this.state.isLoading) {
        // Loading is over
        this.setState({ isLoading: false });
      }
      if (this.state.isPlaying) {
        // Must play: enforce chunks scheduling
        this.scheduleChunks();
      }
    } else {
      this.setState({ isLoading: true });
    }

    // Find next chunk to load
    const chunkToLoad: ?number = bufferingChunks.find(idx => !loadedChunks.includes(idx));
    if (typeof chunkToLoad === 'number') {
      this.loadChunk(chunkToLoad);
    }

    // Delete other chunks (if any)
    const chunksToDelete: Array<number> = loadedChunks.filter(idx => !bufferingChunks.includes(idx));
    this.chunks.forEach((chunk, idx) => {
      if (chunksToDelete.includes(idx)) {
        this.unscheduleChunk(chunk);
      }
    });
    chunksToDelete.forEach(idx => this.chunks.delete(idx));
  }

  /**
   * Asynchronously request and decode the given file using an OfflineAudioContext.
   * @param {number} idx Chunk idx
   */
  loadChunk = (idx: number) => {
    let url = this.props.sourceURL + idx.toFixed() + '.wav';

    let request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';

    request.onload = () => {
      const duration: number = this.props.sampleRate * CHUNK_DURATION;
      const offlineAudioContext = new (window.OfflineAudioContext ||
        window.webkitOfflineAudioContext)(1, duration, this.props.sampleRate);

      offlineAudioContext.decodeAudioData(
        request.response,
        (buffer: AudioBuffer) => this.addChunk(idx, buffer),
        () => { this.props.onError('Error during audio data decoding'); }
      );
    }

    request.send();
  }

  addChunk = (idx: number, buffer: AudioBuffer) => {
    // Save chunk
    const chunk: Chunk = {
      buffer,
      isScheduled: false,
      source: null,
    };
    this.chunks.set(idx, chunk);

    // Handle chunks state
    this.handleChunksLoading();
    if (this.state.isPlaying) {
      this.scheduleChunks();
    }
  }

  scheduleChunks = () => {
    // Set listen tracker to inform parent component
    this.setListenTracker();

    // Common data
    const currentIdx: number = this.getChunkIdxFromTime(this.state.startTime);

    let audioContextStartTime = this.audioContext.currentTime + START_GAP;
    if (this.audioContextStartTime > 0) {
      audioContextStartTime = this.audioContextStartTime;
    }

    // Schedule all unscheduled chunks
    this.chunks.forEach((chunk, idx) => {
      if (!chunk.isScheduled) {

        // Create matching source
        let source: AudioBufferSourceNode = this.audioContext.createBufferSource();
        source.playbackRate.setValueAtTime(this.state.playbackRate, this.audioContext.currentTime);
        source.buffer = chunk.buffer;
        source.connect(this.audioContext.destination);

        if (idx === currentIdx) {
          const offset: number = this.state.startTime - (idx * CHUNK_DURATION);
          const duration: number = (idx + 1) * CHUNK_DURATION - this.state.startTime;
          source.start(audioContextStartTime, offset, duration);
        } else {
          const whenOffset: number = (idx * CHUNK_DURATION - this.state.startTime) / this.state.playbackRate;
          source.start(audioContextStartTime + whenOffset, 0, CHUNK_DURATION);
        }
        source.addEventListener('ended', this.handleChunksLoading);
        chunk.isScheduled = true;
        chunk.source = source;
      }
    });

    // Save audio context start timer for future calculations
    this.audioContextStartTime = audioContextStartTime;
  }

  unscheduleChunks = () => {
    this.chunks.forEach(chunk => {
      this.unscheduleChunk(chunk);
    });
    this.audioContextStartTime = 0;
  }

  unscheduleChunk = (chunk: Chunk) => {
    if (chunk.source) {
      const source: AudioBufferSourceNode = chunk.source;
      source.removeEventListener('ended', this.handleChunksLoading);
      source.stop(0);
      source.disconnect();
    }
    chunk.isScheduled = false;
    chunk.source = null;
  }

  playPause = () => {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play = (forcedStart: ?number, forcedEnd: ?number) => {
    // Compute start and end time
    const bounds: {start: number, end: number} = this.sanitizePlayBounds(forcedStart, forcedEnd);

    if (this.state.isPlaying) {
      // Already playing, must stop
      this.unscheduleChunks();
    }

    // Set state with useful data, then load and reschedule chunks
    this.setState({
      isPlaying: true,
      startTime: bounds.start,
      endTime: bounds.end,
    }, this.handleChunksLoading);
  }

  pause = () => {
    if (this.state.isPlaying) {
      this.clearListenTracker();

      const startTime: number = this.getCurrentTime();

      this.setState({
        isPlaying: false,
        startTime,
      }, this.unscheduleChunks);
    }
  }

  onPlaybackRateChange = (event: SyntheticInputEvent<HTMLSelectElement>) => {
    if (!this.state.isPlaying) {
      const newRate: number = parseFloat(event.target.value);
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
        disabled={this.state.isPlaying}
        onChange={this.onPlaybackRateChange}
      >{playbackRateOptions}</select>
    );
  }
}

export default AudioManager;
