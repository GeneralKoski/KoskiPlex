import React, { useEffect, useRef } from 'react';
import { Message } from '../types';

interface ChatProps {
  messages: Message[];
  streamingReply: string;
}

const Chat: React.FC<ChatProps> = ({ messages, streamingReply }) => {
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingReply]);

  return (
    <div className="chat">
      {messages.map((msg, i) => (
        <div key={i} className={`chat-bubble ${msg.role === 'user' ? 'chat-user' : 'chat-ai'}`}>
          <span className="chat-role">{msg.role === 'user' ? 'You' : 'KoskiPlex'}</span>
          <p className="chat-text">{msg.text}</p>
        </div>
      ))}
      {streamingReply && (
        <div className="chat-bubble chat-ai chat-streaming">
          <span className="chat-role">KoskiPlex</span>
          <p className="chat-text">{streamingReply}<span className="cursor" /></p>
        </div>
      )}
      <div ref={chatEndRef} />
    </div>
  );
};

export default Chat;
