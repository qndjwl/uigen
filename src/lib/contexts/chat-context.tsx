"use client";

import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useRef,
} from "react";
import { useChat as useAIChat } from "@ai-sdk/react";
import { Message } from "ai";
import { useFileSystem } from "./file-system-context";
import { setHasAnonWork } from "@/lib/anon-work-tracker";

interface ChatContextProps {
  projectId?: string;
  initialMessages?: Message[];
}

interface ChatContextType {
  messages: Message[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  status: string;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({
  children,
  projectId,
  initialMessages = [],
}: ChatContextProps & { children: ReactNode }) {
  const { fileSystem, handleToolCall } = useFileSystem();

  // Track tool calls already applied so we never double-apply across re-renders
  const appliedToolCallIds = useRef(
    new Set<string>(
      initialMessages.flatMap((m) => m.parts ?? []).flatMap((p) =>
        p.type === "tool-invocation" ? [(p as any).toolInvocation.toolCallId] : []
      )
    )
  );

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    status,
  } = useAIChat({
    api: "/api/chat",
    initialMessages,
    body: {
      files: fileSystem.serialize(),
      projectId,
    },
  });

  // Apply tool call results to the client file system as they appear in the message stream.
  // onToolCall is only fired for client-side tools; server-side tools (str_replace_editor,
  // file_manager) have execute() on the server, so we must read from messages instead.
  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant" || !message.parts) continue;
      for (const part of message.parts) {
        if (
          part.type === "tool-invocation" &&
          part.toolInvocation.state === "result" &&
          !appliedToolCallIds.current.has(part.toolInvocation.toolCallId)
        ) {
          appliedToolCallIds.current.add(part.toolInvocation.toolCallId);
          handleToolCall({
            toolName: part.toolInvocation.toolName,
            args: part.toolInvocation.args,
          });
        }
      }
    }
  }, [messages, handleToolCall]);

  // Track anonymous work
  useEffect(() => {
    if (!projectId && messages.length > 0) {
      setHasAnonWork(messages, fileSystem.serialize());
    }
  }, [messages, fileSystem, projectId]);

  return (
    <ChatContext.Provider
      value={{
        messages,
        input,
        handleInputChange,
        handleSubmit,
        status,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}