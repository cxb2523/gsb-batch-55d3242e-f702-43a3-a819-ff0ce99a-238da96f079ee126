/**
 * dsh web, redrawn from its own stylesheets: the dark tokens, the 280px sidebar (here scaled to the
 * stage), the 76px session header with Chat / Trajectory, the transcript's tool rows and the
 * pill composer. Nothing here is a generic chat UI — every measurement is the host's.
 */
import { useRef, type ReactNode, type Ref } from "react";
import { useFlip } from "../live/motion.ts";
import { Icon, type IconName, Wordmark } from "./icons.tsx";

export const SESSIONS = ["Refactor the auth middleware", "Why is CI flaky on macOS", "Weekly report draft"];

const Row = ({ icon, children, active }: { icon?: IconName; children: ReactNode; active?: boolean }) => (
  <div className={`flex h-8 items-center gap-2.5 rounded-xl px-2.5 text-[13px] transition-colors duration-300 ${active ? "bg-[#43454a] text-[#f9fafb]" : "text-[#cfd3d6]"}`}>
    {icon && <Icon name={icon} className="size-4 shrink-0 text-[#adb2b8]" />}
    <span className="truncate">{children}</span>
  </div>
);

export function Sidebar({ sessions, active }: { sessions: string[]; active: number }) {
  const list = useRef<HTMLDivElement>(null);
  useFlip(list);
  return (
    <aside className="hidden w-[212px] shrink-0 flex-col bg-[#1b1b1c] px-2.5 pb-3 md:flex">
      <div className="flex h-[52px] items-center gap-2 px-1.5">
        <Wordmark className="h-[19px] w-[144px] text-[#f9fafb]" />
        <Icon name="panel" className="ml-auto size-4 text-[#81858c]" />
      </div>
      <div className="flex h-[34px] items-center gap-2 rounded-xl bg-[#2c2c2e] px-2.5 text-[13px] text-[#f9fafb]">
        <Icon name="newChat" className="size-4" /> New session
      </div>
      <div className="mt-3 flex flex-col gap-0.5">
        <Row icon="plugin">Plugins</Row>
        <Row icon="clock">Automation tasks</Row>
      </div>
      <div className="mt-5 flex items-center gap-1.5 px-2.5 text-[12px] text-[#81858c]">
        <Icon name="folder" className="size-3.5" /> dsh-generative-ui
      </div>
      <div ref={list} className="ui4a-sessions mt-1 flex flex-col gap-0.5">
        {sessions.map((title, i) => (
          <Row key={title} active={i === active}>
            {title}
          </Row>
        ))}
        {SESSIONS.map((title) => (
          <Row key={title}>{title}</Row>
        ))}
      </div>
      <div className="mt-auto">
        <Row icon="settings">Settings</Row>
      </div>
    </aside>
  );
}

export const Header = ({ title }: { title: string }) => (
  <header className="flex min-h-[60px] items-center justify-between gap-4 border-b-[0.5px] border-[#ffffff29] px-6 max-sm:px-4">
    <div className="flex min-w-0 items-center gap-1.5 text-[14px]">
      <span className="text-[#81858c] max-sm:hidden">dsh-generative-ui</span>
      <span className="text-[#81858c] max-sm:hidden">/</span>
      <span key={title} className="ui4a-fade truncate text-[#f9fafb]">
        {title}
      </span>
    </div>
    <nav className="flex shrink-0 gap-7 self-stretch text-[14px]">
      <span className="relative flex items-center text-[#7aaaff]">
        Chat
        <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#7aaaff]" />
      </span>
      <span className="flex items-center text-[#adb2b8]">Trajectory</span>
    </nav>
  </header>
);

/** The transcript's tool / skill / context row: one recipe for all three, 24px, tertiary. */
export const ToolRow = ({ icon, kind, detail, done }: { icon: IconName; kind: string; detail: string; done: boolean }) => (
  <div className="ui4a-fade flex h-6 items-center gap-2 text-[13px] text-[#adb2b8]">
    <Icon name={icon} className="size-3.5" />
    <span>{kind}</span>
    <span className="size-[2px] rounded-full bg-[#81858c]" />
    <span className={done ? "" : "ui4a-pulse"}>{detail}</span>
  </div>
);

export const UserBubble = ({ children }: { children: ReactNode }) => (
  <div className="ui4a-fade flex justify-end">
    <div data-morph className="max-w-[80%] rounded-[20px] bg-[#2c2c2e] px-4 py-2.5 text-[14px] leading-[22px] text-[#f9fafb]">
      {children}
    </div>
  </div>
);

export const Composer = ({ text, narrow, sendRef, onSend }: { text: string; narrow: boolean; sendRef: Ref<HTMLButtonElement>; onSend: () => void }) => (
  <div className="rounded-[28px] bg-[#2c2c2e] px-4 pb-2.5 pt-3.5">
    <div className="min-h-[22px] text-[14px] leading-[22px]">
      {text ? (
        <span className="text-[#f9fafb]">
          {text}
          <span className="ui4a-caret" />
        </span>
      ) : (
        <span className="line-clamp-1 text-[#81858c]">Message or run a task, / commands, @ files or sessions</span>
      )}
    </div>
    <div className="mt-2.5 flex items-center gap-2 text-[13px] text-[#adb2b8]">
      <span className="flex size-7 items-center justify-center rounded-full border border-[#ffffff1f]">
        <Icon name="plus" className="size-3.5" />
      </span>
      <span className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2">
        <Icon name="workspace" className="size-3.5" />
        {!narrow && <span className="max-sm:hidden"> Workspace Write</span>} <Icon name="chevron" className="size-3" />
      </span>
      <span className="ml-auto whitespace-nowrap max-sm:hidden">{!narrow && "DeepSeek-V3.2"}</span>
      <button ref={sendRef} type="button" aria-label="Send" onClick={onSend} className={`flex size-[34px] items-center justify-center rounded-full text-white transition-[background-color,transform] duration-200 active:scale-95 ${text ? "bg-[#7aaaff]" : "bg-[#43454a]"}`}>
        <Icon name="send" className="size-4 -translate-y-px" />
      </button>
    </div>
  </div>
);

export const Frame = ({ sidebar, children, className = "" }: { sidebar: ReactNode; children: ReactNode; className?: string }) => (
  <div className={`flex overflow-hidden rounded-2xl border border-[#ffffff1f] bg-[#151517] dsh-frame ${className}`}>
    {sidebar}
    <div className="flex min-w-0 flex-1 flex-col">{children}</div>
  </div>
);
