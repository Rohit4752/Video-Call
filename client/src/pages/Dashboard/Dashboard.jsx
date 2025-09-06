import React, { useEffect, useRef, useState } from "react";
import socketInstance from "../components/socketio/VideoCallSocket";
import {
  FaBars,
  FaTimes,
  FaPhoneAlt,
  FaMicrophone,
  FaVideo,
  FaVideoSlash,
  FaMicrophoneSlash,
  FaPhoneSlash,
} from "react-icons/fa";
import { RiLogoutBoxLine } from "react-icons/ri";
import Lottie from "lottie-react";
import { Howl } from "howler";
import wavingAnimation from "../../assets/waving.json";
import apiClient from "../../apiClient";
import { useUser } from "../../context/UserContextApi";
import { useNavigate } from "react-router-dom";
import Peer from "simple-peer";
import toast from "react-hot-toast";

const Dashboard = () => {
  const { user, updateUser } = useUser();
  const navigate = useNavigate();
  const socket = socketInstance.getSocket();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [userOnline, setUserOnline] = useState([]);
  const [stream, setStream] = useState(null);
  const [me, setMe] = useState("");
  const [showUserDetailModal, setShowUserDetailModal] = useState(false);
  const [modalUser, setModalUser] = useState(null);
  const [receiveCall, setReceiveCall] = useState(false);
  const [caller, setCaller] = useState(null);
  const [callerId, setCallerId] = useState(null);
  const [callerName, setCallerName] = useState("");
  const [callerSignal, setCallerSignal] = useState(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [callerWaiting, setCallerWaiting] = useState(false);
  const [callRejectedPopUp, setCallRejectedPopUp] = useState(false);
  const [rejectorData, setCallRejectorData] = useState(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);

  const myVideo = useRef(null);
  const receiverVideo = useRef(null);
  const connectionRef = useRef(null);
  const hasJoined = useRef(false);

  const ringtone = useRef(
    new Howl({
      src: ["/ringtone.mp3"],
      loop: true,
      volume: 1.0,
    })
  ).current;

  // Socket listeners
  useEffect(() => {
    if (!socket || !user) return;

    if (!hasJoined.current) {
      socket.emit("join", { id: user._id, name: user.username });
      hasJoined.current = true;
    }

    const handleMe = (id) => setMe(id);
    const handleCallToUser = (data) => {
      setReceiveCall(true);
      setCaller(data);
      setCallerName(data?.name || "Unknown");
      setCallerSignal(data?.signal ?? data?.signalData ?? null);
      setCallerId(data?.from ?? null);
      try {
        ringtone.play();
      } catch (e) {
        console.warn("Ringtone play failed:", e);
      }
    };
    const handleCallRejected = (data) => {
      ringtone.stop();
      setCallRejectedPopUp(true);
      setCallRejectorData(data);
      setCallerWaiting(false);
    };
    const handleCallEnded = (data) => {
      console.log("Call ended by", data?.name);
      ringtone.stop();
      endCallCleanup();
    };
    const handleUserUnavailable = (data) => {
      toast.error(data?.message || "User is not available.");
    };
    const handleUserBusy = (data) => {
      toast.error(data?.message || "User is currently in another call.");
    };
    const handleOnlineUsers = (onlineUsers) => setUserOnline(onlineUsers);

    socket.on("me", handleMe);
    socket.on("callToUser", handleCallToUser);
    socket.on("callRejected", handleCallRejected);
    socket.on("callEnded", handleCallEnded);
    socket.on("userUnavailable", handleUserUnavailable);
    socket.on("userBusy", handleUserBusy);
    socket.on("online-users", handleOnlineUsers);

    return () => {
      socket.off("me", handleMe);
      socket.off("callToUser", handleCallToUser);
      socket.off("callRejected", handleCallRejected);
      socket.off("callEnded", handleCallEnded);
      socket.off("userUnavailable", handleUserUnavailable);
      socket.off("userBusy", handleUserBusy);
      socket.off("online-users", handleOnlineUsers);
      ringtone.stop();
    };
  }, [socket, user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      connectionRef.current?.destroy();
      ringtone.stop();
    };
  }, [stream]);

  // Start call (initiator)
  const startCall = async () => {
    if (!modalUser) {
      toast.error("No user selected for the call.");
      return;
    }
    if (callAccepted || receiveCall) {
      toast.error("End the current call before starting a new one.");
      return;
    }
    try {
      const currentStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      setStream(currentStream);
      if (myVideo.current) {
        myVideo.current.srcObject = currentStream;
        myVideo.current.muted = true;
      }
      currentStream.getAudioTracks().forEach((t) => (t.enabled = isMicOn));
      currentStream.getVideoTracks().forEach((t) => (t.enabled = isCamOn));

      setCallRejectedPopUp(false);
      setIsSidebarOpen(false);
      setCallerWaiting(true);
      setSelectedUser(modalUser._id);

      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream: currentStream,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        },
      });

      peer.on("signal", (signalData) => {
        socket.emit("callToUser", {
          callToUserId: modalUser._id,
          signal: signalData,
          from: me,
          name: user?.username,
          email: user?.email,
          profilepic: user?.profilepic,
        });
      });

      peer.on("stream", (remoteStream) => {
        if (receiverVideo.current) {
          receiverVideo.current.srcObject = remoteStream;
        }
      });

      peer.on("error", (err) => {
        console.error("Peer error:", err);
        toast.error("Failed to establish call.");
        endCallCleanup();
      });

      socket.once("callAccepted", (data) => {
        setCallRejectedPopUp(false);
        setCallAccepted(true);
        setCallerWaiting(false);
        setCallerId(data?.from ?? null);
        try {
          peer.signal(data?.signal ?? data?.signalData);
        } catch (e) {
          console.error("peer.signal error:", e);
          toast.error("Error accepting call.");
        }
      });

      connectionRef.current = peer;
      setShowUserDetailModal(false);
    } catch (error) {
      console.error("Error accessing media devices:", error);
      toast.error("Failed to access camera or microphone.");
    }
  };

  // Accept call (receiver)
  const handleAcceptCall = async () => {
    ringtone.stop();
    try {
      const currentStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      setStream(currentStream);
      if (myVideo.current) {
        myVideo.current.srcObject = currentStream;
        myVideo.current.muted = true;
      }
      currentStream.getAudioTracks().forEach((t) => (t.enabled = isMicOn));
      currentStream.getVideoTracks().forEach((t) => (t.enabled = isCamOn));

      setCallAccepted(true);
      setReceiveCall(true);
      setCallerWaiting(false);
      setIsSidebarOpen(false);

      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: currentStream,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        },
      });

      peer.on("signal", (signalData) => {
        socket.emit("answeredCall", {
          signal: signalData,
          from: me,
          to: caller?.from ?? callerId,
        });
      });

      peer.on("stream", (remoteStream) => {
        if (receiverVideo.current) {
          receiverVideo.current.srcObject = remoteStream;
        }
      });

      peer.on("error", (err) => {
        console.error("Peer error:", err);
        toast.error("Failed to establish call.");
        endCallCleanup();
      });

      if (callerSignal) {
        try {
          peer.signal(callerSignal);
        } catch (e) {
          console.error("peer.signal error on accept:", e);
          toast.error("Error accepting call.");
        }
      }

      connectionRef.current = peer;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      toast.error("Failed to access camera or microphone.");
    }
  };

  // Reject call
  const handleRejectCall = () => {
    ringtone.stop();
    setCallerWaiting(false);
    setReceiveCall(false);
    setCallAccepted(false);

    socket.emit("reject-call", {
      to: caller?.from ?? callerId,
      name: user?.username,
      profilepic: user?.profilepic,
    });

    setCaller(null);
    setCallerId(null);
    setCallerName("");
    setCallerSignal(null);
  };

  // End call
  const handleEndCall = () => {
    ringtone.stop();
    socket.emit("call-ended", {
      to: caller?.from ?? selectedUser ?? callerId,
      name: user?.username,
    });
    endCallCleanup();
  };

  // Cleanup after call
  const endCallCleanup = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (receiverVideo.current) receiverVideo.current.srcObject = null;
    if (myVideo.current) myVideo.current.srcObject = null;
    connectionRef.current?.destroy();
    ringtone.stop();

    setCallerWaiting(false);
    setStream(null);
    setReceiveCall(false);
    setCallAccepted(false);
    setSelectedUser(null);
    setCaller(null);
    setCallerId(null);
    setCallerName("");
    setCallerSignal(null);
    setShowUserDetailModal(false);
    setCallRejectedPopUp(false);
    setCallRejectorData(null);
    setIsMicOn(true);
    setIsCamOn(true);
  };

  // Toggle mic
  const toggleMic = () => {
    if (stream) {
      setIsMicOn((prev) => {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) audioTrack.enabled = !prev;
        return !prev;
      });
    }
  };

  // Toggle camera
  const toggleCam = () => {
    if (stream) {
      setIsCamOn((prev) => {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) videoTrack.enabled = !prev;
        return !prev;
      });
    }
  };

  // Fetch all users
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get("/user");
      if (response?.data?.success !== false) {
        setUsers(response.data.users || []);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
      toast.error("Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const isOnlineUser = (userId) => userOnline.some((u) => u.userId === userId);

  const handleSelectedUser = (userId) => {
    if (callAccepted || receiveCall) {
      toast.error("End the current call before starting a new one.");
      return;
    }
    const selected = filteredUsers.find((u) => u._id === userId);
    setModalUser(selected);
    setShowUserDetailModal(true);
  };

  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleLogout = async () => {
    if (callAccepted || receiveCall) {
      toast.error("End the call before logging out.");
      return;
    }
    try {
      await apiClient.post("/auth/logout");
      socket.disconnect();
      socketInstance.setSocket(null);
      updateUser(null);
      localStorage.removeItem("userData");
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
      toast.error("Failed to log out.");
    }
  };

  const handleCallAgain = () => {
    endCallCleanup();
    setTimeout(() => {
      startCall();
    }, 200);
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-10 md:hidden bg-black bg-opacity-50"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`bg-gradient-to-br from-blue-900 to-purple-800 text-white w-64 h-screen p-4 space-y-4 fixed z-20 transition-transform ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 md:h-full`}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Users</h1>
          <button
            type="button"
            className="md:hidden text-white"
            onClick={() => setIsSidebarOpen(false)}
          >
            <FaTimes size={24} />
          </button>
        </div>

        <input
          type="text"
          placeholder="Search user..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <ul className="space-y-4 overflow-y-auto h-[calc(100vh-150px)]">
          {loading ? (
            <li className="text-gray-400">Loading users...</li>
          ) : filteredUsers.length === 0 ? (
            <li className="text-gray-400">No users found</li>
          ) : (
            filteredUsers.map((u) => (
              <li
                key={u._id}
                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${
                  selectedUser === u._id ? "bg-green-600" : "bg-gradient-to-r from-purple-600 to-blue-400"
                } hover:bg-green-500 transition-colors`}
                onClick={() => handleSelectedUser(u._id)}
              >
                <div className="relative">
                  <img
                    src={u.profilepic || "/default-avatar.png"}
                    alt={`${u.username}'s profile`}
                    className="w-10 h-10 rounded-full border border-white"
                  />
                  {isOnlineUser(u._id) && (
                    <span className="absolute top-0 right-0 w-3 h-3 bg-green-500 border-2 border-gray-800 rounded-full animate-pulse" />
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-sm">{u.username}</span>
                  <span className="text-xs text-gray-400 truncate w-32">{u.email}</span>
                </div>
              </li>
            ))
          )}
        </ul>

        {user && (
          <button
            onClick={handleLogout}
            className="absolute bottom-4 left-4 right-4 flex items-center gap-2 bg-red-500 px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
          >
            <RiLogoutBoxLine size={20} />
            Logout
          </button>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64">
        {selectedUser || receiveCall || callAccepted ? (
          <div className="relative w-full h-screen bg-black flex items-center justify-center">
            {callerWaiting ? (
              <div className="flex flex-col items-center text-white">
                <p className="font-bold text-xl mb-4">Waiting for {modalUser?.username}</p>
                <img
                  src={modalUser?.profilepic || "/default-avatar.png"}
                  alt="User"
                  className="w-20 h-20 rounded-full border-4 border-blue-500 animate-pulse"
                />
                <p className="text-sm text-gray-300 mt-2">{modalUser?.email}</p>
              </div>
            ) : (
              <video
                ref={receiverVideo}
                autoPlay
                playsInline
                className="absolute top-0 left-0 w-full h-full object-cover"
              />
            )}

            <div className="absolute bottom-4 right-4 bg-gray-900 rounded-lg overflow-hidden shadow-lg">
              <video
                ref={myVideo}
                autoPlay
                playsInline
                muted
                className="w-32 h-40 md:w-48 md:h-36 object-cover"
              />
            </div>

            <div className="absolute top-4 left-4 text-white font-bold flex items-center gap-3">
              <button
                type="button"
                className="md:hidden text-2xl"
                onClick={() => setIsSidebarOpen(true)}
              >
                <FaBars />
              </button>
              <span>{callerName || modalUser?.username || "Caller"}</span>
            </div>

            <div className="absolute bottom-4 w-full flex justify-center gap-4">
              <button
                type="button"
                className="bg-red-600 p-3 rounded-full text-white hover:bg-red-700 transition-colors"
                onClick={handleEndCall}
              >
                <FaPhoneSlash size={24} />
              </button>
              <button
                type="button"
                onClick={toggleMic}
                className={`p-3 rounded-full text-white transition-colors ${
                  isMicOn ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {isMicOn ? <FaMicrophone size={24} /> : <FaMicrophoneSlash size={24} />}
              </button>
              <button
                type="button"
                onClick={toggleCam}
                className={`p-3 rounded-full text-white transition-colors ${
                  isCamOn ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {isCamOn ? <FaVideo size={24} /> : <FaVideoSlash size={24} />}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <button
              type="button"
              className="md:hidden text-2xl text-black mb-4"
              onClick={() => setIsSidebarOpen(true)}
            >
              <FaBars />
            </button>

            <div className="flex items-center gap-5 mb-6 bg-gray-800 p-5 rounded-xl shadow-md">
              <div className="w-20 h-20">
                <Lottie animationData={wavingAnimation} loop autoplay />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">
                  Hey {user?.username || "Guest"}! 👋
                </h1>
                <p className="text-lg text-gray-300 mt-2">
                  Ready to <strong>connect with friends</strong>? Select a user to start a video call! 🎥
                </p>
              </div>
            </div>

            <div className="bg-gray-800 p-4 rounded-lg shadow-lg text-sm text-gray-300">
              <h2 className="text-lg font-semibold mb-2 text-white">💡 How to Start a Video Call</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Open the sidebar to see online users.</li>
                <li>Use the search bar to find a specific person.</li>
                <li>Click a user to start a video call!</li>
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* User Detail Modal */}
      {showUserDetailModal && modalUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <div className="flex flex-col items-center">
              <h2 className="font-bold text-xl mb-4">User Details</h2>
              <img
                src={modalUser.profilepic || "/default-avatar.png"}
                alt="User"
                className="w-20 h-20 rounded-full border-4 border-blue-500"
              />
              <h3 className="text-lg font-bold mt-3">{modalUser.username}</h3>
              <p className="text-sm text-gray-500">{modalUser.email}</p>
              <div className="flex gap-4 mt-5">
                <button
                  onClick={() => {
                    setSelectedUser(modalUser._id);
                    startCall();
                  }}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700 transition-colors"
                >
                  Call <FaPhoneAlt />
                </button>
                <button
                  onClick={() => setShowUserDetailModal(false)}
                  className="bg-gray-400 text-white px-4 py-2 rounded-lg hover:bg-gray-500 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Call Rejected Popup */}
      {callRejectedPopUp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <div className="flex flex-col items-center">
              <h2 className="font-bold text-xl mb-4">Call Rejected</h2>
              <img
                src={rejectorData?.profilepic || "/default-avatar.png"}
                alt="Caller"
                className="w-20 h-20 rounded-full border-4 border-red-500"
              />
              <h3 className="text-lg font-bold mt-3">{rejectorData?.name}</h3>
              <div className="flex gap-4 mt-5">
                <button
                  onClick={handleCallAgain}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg flex gap-2 items-center hover:bg-green-700 transition-colors"
                >
                  Call Again <FaPhoneAlt />
                </button>
                <button
                  onClick={() => {
                    endCallCleanup();
                    setCallRejectedPopUp(false);
                  }}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg flex gap-2 items-center hover:bg-red-700 transition-colors"
                >
                  Back <FaPhoneSlash />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Incoming Call Modal */}
      {receiveCall && !callAccepted && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <div className="flex flex-col items-center">
              <h2 className="font-bold text-xl mb-4">Incoming Call</h2>
              <img
                src={caller?.profilepic || "/default-avatar.png"}
                alt="Caller"
                className="w-20 h-20 rounded-full border-4 border-green-500"
              />
              <h3 className="text-lg font-bold mt-3">{callerName}</h3>
              <p className="text-sm text-gray-500">{caller?.email}</p>
              <div className="flex gap-4 mt-5">
                <button
                  onClick={handleAcceptCall}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg flex gap-2 items-center hover:bg-green-700 transition-colors"
                >
                  Accept <FaPhoneAlt />
                </button>
                <button
                  onClick={handleRejectCall}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg flex gap-2 items-center hover:bg-red-700 transition-colors"
                >
                  Reject <FaPhoneSlash />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;