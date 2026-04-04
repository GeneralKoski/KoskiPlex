import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useRef } from "react";
import { Message } from "../types";

interface ChatProps {
  messages: Message[];
  streamingReply: string;
}

const Chat: React.FC<ChatProps> = ({ messages, streamingReply }) => {
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingReply]);

  return (
    <div className="chat">
      <AnimatePresence mode="popLayout" initial={false}>
        {messages.map((msg, i) => (
          <motion.div
            key={`${i}-${msg.text.slice(0, 5)}`}
            className={`chat-bubble ${msg.role === "user" ? "chat-user" : "chat-ai"}`}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          >
            <span className="chat-role">
              {msg.role === "user" ? "You" : "KoskiPlex"}
            </span>
            <p className="chat-text">{msg.text}</p>
          </motion.div>
        ))}
        {streamingReply && (
          <motion.div
            key="streaming"
            className="chat-bubble chat-ai chat-streaming"
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="chat-role">KoskiPlex</span>
            <p className="chat-text">
              {streamingReply}
              <span className="cursor" />
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      <div ref={chatEndRef} />
    </div>
  );
};

export default Chat;
