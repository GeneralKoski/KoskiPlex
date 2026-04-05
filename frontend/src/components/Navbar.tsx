import { motion } from "framer-motion";
import { MessageCircle, Mic, Settings } from "lucide-react";
import React from "react";

export type TabType = "chat" | "practice" | "settings";

interface NavbarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TABS = [
  { id: "chat", icon: MessageCircle, label: "Chat" },
  { id: "practice", icon: Mic, label: "Practice" },
  { id: "settings", icon: Settings, label: "Settings" },
] as const;

const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  return (
    <nav className="navbar">
      <div className="navbar-container">
        {TABS.map(({ id, icon: Icon, label }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`nav-item ${isActive ? "active" : ""}`}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-glow"
                  className="nav-item-glow"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <Icon size={20} className="nav-icon" />
              <span className="nav-label">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default Navbar;
