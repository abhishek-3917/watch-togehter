import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Camera, CameraOff, Copy, Headphones, Link2, LogIn, MessageCircle, Mic, MicOff, MonitorPlay, Pause, Play, Send, Users, Volume2 } from "lucide-react";

const socket = io("/", { autoConnect: false });
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    ...(import.meta.env.VITE_TURN_URL ? [{
      urls: import.meta.env.VITE_TURN_URL,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL
    }] : [])
  ]
};

export default function App() {
  const [roomInput, setRoomInput] = useState("");
  const [roomId, setRoomId] = useState("");
  const [name, setName] = useState("You");
  const [joined, setJoined] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [status, setStatus] = useState("Not connected");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [remotePresent, setRemotePresent] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef(null);
  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const streamRef = useRef(null);
  const peerRef = useRef(null);
  const peerIdRef = useRef(null);
  const pendingIce = useRef([]);
  const ignoreSync = useRef(false);
  const syncTimer = useRef(null);

  const makeRoom = () => {
    const id = Math.random().toString(36).slice(2, 8).toUpperCase();
    setRoomInput(id);
  };

  const startCall = async (peerId, shouldOffer) => {
    if (peerRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (localRef.current) localRef.current.srcObject = stream;
      const pc = new RTCPeerConnection(rtcConfig);
      peerRef.current = pc;
      peerIdRef.current = peerId;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      pc.ontrack = event => {
        if (remoteRef.current) remoteRef.current.srcObject = event.streams[0];
        setRemotePresent(true);
      };
      pc.onicecandidate = event => {
        if (event.candidate) socket.emit("webrtc-ice", { to: peerId, candidate: event.candidate });
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(pc.connectionState)) setRemotePresent(false);
      };
      if (shouldOffer) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc-offer", { to: peerId, description: pc.localDescription });
      }
    } catch {
      setError("Camera/microphone access was blocked. Allow permissions and try joining the call again.");
    }
  };

  const join = async () => {
    const id = (roomInput || "").trim().toUpperCase();
    if (!id) return setError("Enter a room code or create a new room.");
    setError("");
    setRoomId(id);
    socket.connect();
    socket.emit("join-room", { roomId: id, name });
    setJoined(true);
    setStatus("Joining room…");
  };

  useEffect(() => {
    const onState = ({ playback, peers }) => {
      setStatus("Connected");
      if (playback?.src) { setVideoUrl(playback.src); if (videoRef.current) videoRef.current.src = playback.src; }
      if (playback?.time) applyPlayback(playback);
      if (peers?.length) startCall(peers[0].id, true);
    };
    const onFull = () => { setError("This room already has two participants."); setJoined(false); };
    const onPeerJoined = ({ id }) => { startCall(id, false); };
    const onPlayback = applyPlayback;
    const onMessage = msg => setMessages(prev => [...prev, msg]);
    const onParticipants = list => setParticipants(list || []);
    const onOffer = async ({ from, description }) => {
      if (!peerRef.current) await startCall(from, false);
      if (!peerRef.current) return;
      await peerRef.current.setRemoteDescription(description);
      const answer = await peerRef.current.createAnswer();
      await peerRef.current.setLocalDescription(answer);
      socket.emit("webrtc-answer", { to: from, description: peerRef.current.localDescription });
      for (const candidate of pendingIce.current) await peerRef.current.addIceCandidate(candidate);
      pendingIce.current = [];
    };
    const onAnswer = async ({ description }) => {
      if (peerRef.current) {
        await peerRef.current.setRemoteDescription(description);
        for (const candidate of pendingIce.current) await peerRef.current.addIceCandidate(candidate);
        pendingIce.current = [];
      }
    };
    const onIce = async ({ candidate }) => {
      if (!candidate) return;
      if (peerRef.current?.remoteDescription) await peerRef.current.addIceCandidate(candidate);
      else pendingIce.current.push(candidate);
    };
    const onPeerLeft = () => { peerRef.current?.close(); peerRef.current = null; peerIdRef.current = null; setRemotePresent(false); };
    socket.on("room-state", onState);
    socket.on("room-full", onFull);
    socket.on("peer-joined", onPeerJoined);
    socket.on("playback", onPlayback);
    socket.on("chat-message", onMessage);
    socket.on("participants", onParticipants);
    socket.on("webrtc-offer", onOffer);
    socket.on("webrtc-answer", onAnswer);
    socket.on("webrtc-ice", onIce);
    socket.on("peer-left", onPeerLeft);
    return () => {
      socket.off("room-state", onState); socket.off("room-full", onFull);
      socket.off("peer-joined", onPeerJoined); socket.off("playback", onPlayback);
      socket.off("chat-message", onMessage); socket.off("participants", onParticipants);
      socket.off("webrtc-offer", onOffer); socket.off("webrtc-answer", onAnswer);
      socket.off("webrtc-ice", onIce); socket.off("peer-left", onPeerLeft);
    };
  }, []);

  function applyPlayback(state) {
    const video = videoRef.current;
    if (!video) return;
    ignoreSync.current = true;
    if (state.src && video.src !== state.src) video.src = state.src;
    if (Number.isFinite(state.time) && Math.abs(video.currentTime - state.time) > 1.5) video.currentTime = state.time;
    if (state.playing) video.play().catch(() => {});
    else video.pause();
    setTimeout(() => { ignoreSync.current = false; }, 350);
  }

  const emitPlayback = () => {
    if (!videoRef.current || ignoreSync.current) return;
    socket.emit("playback", { playing: !videoRef.current.paused, time: videoRef.current.currentTime, src: videoRef.current.currentSrc || videoUrl });
  };

  const loadVideo = () => {
    const url = videoUrl.trim();
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch { return setError("Enter a valid http(s) video URL."); }
    setError("");
    if (videoRef.current) { videoRef.current.src = url; videoRef.current.load(); }
    socket.emit("playback", { playing: false, time: 0, src: url });
  };

  const sendChat = e => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit("chat-message", chatInput.trim());
    setChatInput("");
  };

  const toggleMic = () => {
    const next = !muted; setMuted(next);
    streamRef.current?.getAudioTracks().forEach(t => t.enabled = !next);
  };
  const toggleCamera = () => {
    const next = !cameraOff; setCameraOff(next);
    streamRef.current?.getVideoTracks().forEach(t => t.enabled = !next);
  };
  const copyInvite = async () => {
    await navigator.clipboard.writeText(`${location.origin}?room=${roomId}`);
    setStatus("Invite link copied");
  };

  useEffect(() => {
    const queryRoom = new URLSearchParams(location.search).get("room");
    if (queryRoom) setRoomInput(queryRoom.toUpperCase());
  }, []);

  useEffect(() => () => {
    clearTimeout(syncTimer.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    peerRef.current?.close();
    socket.disconnect();
  }, []);

  if (!joined) return <main className="landing">
    <div className="brand"><div className="brand-icon"><MonitorPlay size={22}/></div><span>together<span className="dot">.</span></span></div>
    <section className="hero">
      <div className="eyebrow"><span className="live-dot"/> YOUR PRIVATE MOVIE NIGHT</div>
      <h1>Same movie.<br/><span>Same moment.</span></h1>
      <p>Make distance feel a little smaller. Watch together, talk together, be together.</p>
      <div className="join-card">
        <label>Your display name</label><input value={name} onChange={e => setName(e.target.value)} maxLength={24}/>
        <label>Room code</label><div className="room-entry"><input placeholder="Enter your room code" value={roomInput} onChange={e => setRoomInput(e.target.value.toUpperCase())}/><button className="secondary" onClick={makeRoom}>Create</button></div>
        <button className="primary wide" onClick={join}><LogIn size={17}/> Join watch room</button>
        {error && <div className="error">{error}</div>}
      </div>
      <div className="landing-foot"><span><Users size={14}/> Private rooms for two</span><span><Headphones size={14}/> Audio + video chat</span></div>
    </section>
  </main>;

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-icon"><MonitorPlay size={20}/></div><span>together<span className="dot">.</span></span></div>
      <div className="room-pill"><span className="live-dot"/>{roomId}<button onClick={copyInvite} title="Copy invite link"><Copy size={14}/></button></div>
      <div className="top-status">{status}</div>
    </header>
    <div className="workspace">
      <section className="main-column">
        <div className="player-wrap">
          <video ref={videoRef} controls playsInline onPlay={emitPlayback} onPause={emitPlayback} onSeeked={emitPlayback} onLoadedMetadata={emitPlayback}/>
          {!videoUrl && <div className="player-empty"><div className="big-play"><Play size={30} fill="currentColor"/></div><h2>Your movie night starts here</h2><p>Add a direct video link below to start watching together.</p></div>}
          <div className="call-pip">
            <video ref={remoteRef} autoPlay playsInline className="remote-video"/>
            {!remotePresent && <div className="pip-empty"><Users size={20}/><span>Waiting for partner</span></div>}
            <video ref={localRef} autoPlay muted playsInline className="local-video"/>
          </div>
        </div>
        <div className="source-row">
          <div className="source-input"><Link2 size={17}/><input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && loadVideo()} placeholder="Paste an authorized MP4 / WebM video URL"/></div>
          <button className="primary" onClick={loadVideo}>Load movie</button>
        </div>
        <p className="source-note">Use a direct video file URL or an authorized provider embed. Some streaming services block external playback.</p>
        <div className="call-controls">
          <div className="control-person"><span className="avatar">Y</span><div><b>{name}</b><small>You</small></div></div>
          <div className="control-buttons">
            <button className={muted ? "control active" : "control"} onClick={toggleMic} title="Toggle microphone">{muted ? <MicOff/> : <Mic/>}</button>
            <button className={cameraOff ? "control active" : "control"} onClick={toggleCamera} title="Toggle camera">{cameraOff ? <CameraOff/> : <Camera/>}</button>
          </div>
          <div className="call-hint"><span className="live-dot"/> Audio/video call {remotePresent ? "connected" : "ready"}</div>
        </div>
      </section>
      <aside className="sidebar">
        <div className="side-heading"><div><h3>Movie night</h3><p>Just the two of you</p></div><span className="two-count"><Users size={14}/>{participants.length}/2</span></div>
        <div className="chat-title"><MessageCircle size={16}/> Live chat</div>
        <div className="messages">
          {messages.length === 0 && <div className="chat-empty"><MessageCircle size={24}/><b>It's a little quiet here</b><span>Send the first message while you get settled.</span></div>}
          {messages.map(m => <div className={m.from === socket.id ? "message mine" : "message"} key={m.id}><div className="message-author">{m.from === socket.id ? "You" : "Partner"}</div><div className="bubble">{m.text}</div></div>)}
        </div>
        <form className="chat-form" onSubmit={sendChat}><input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Send a message…"/><button className="send" aria-label="Send"><Send size={17}/></button></form>
        <div className="sidebar-bottom"><span><Volume2 size={15}/> Keep your call volume comfortable</span><span>Room is private · 2 seats</span></div>
      </aside>
    </div>
    {error && <div className="toast" onClick={() => setError("")}>{error} ×</div>}
  </main>;
}
