// OpenAI Realtime (WebRTC) client. Speech-to-speech tutoring: mic in, model voice
// out, plus a data channel for events. The model drives conversation and calls
// tools; every tool result is supplied by the engine (the authority). See ADR-0001.

export type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export type Caption = { role: "tutor" | "child"; text: string };

export class RealtimeSession {
  state = $state<"idle" | "connecting" | "live" | "ended" | "error">("idle");
  error = $state<string | null>(null);
  muted = $state(false);
  speaking = $state(false);
  captions = $state<Caption[]>([]);

  #pc?: RTCPeerConnection;
  #dc?: RTCDataChannel;
  #audio?: HTMLAudioElement;
  #mic?: MediaStreamTrack;
  #connectTimer?: ReturnType<typeof setTimeout>;
  #onTool: ToolHandler;
  #onChild?: (text: string) => void;

  constructor(onTool: ToolHandler, onChild?: (text: string) => void) {
    this.#onTool = onTool;
    this.#onChild = onChild;
  }

  async connect(getToken: () => Promise<{ value: string; model: string }>) {
    this.#cleanup();
    this.state = "connecting";
    this.error = null;
    try {
      const { value } = await getToken();
      if (!value) throw new Error("no ephemeral token");

      const pc = new RTCPeerConnection();
      this.#pc = pc;
      pc.addEventListener("connectionstatechange", () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          this.#fail("The voice connection dropped.");
        }
      });

      const audio = document.createElement("audio");
      audio.autoplay = true;
      document.body.appendChild(audio);
      this.#audio = audio;
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0];
      };

      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.#mic = ms.getTracks()[0];
      pc.addTrack(this.#mic, ms);

      const dc = pc.createDataChannel("oai-events");
      this.#dc = dc;
      dc.addEventListener("open", () => {
        if (this.#connectTimer) clearTimeout(this.#connectTimer);
        this.state = "live";
      });
      dc.addEventListener("error", () => this.#fail("The voice connection could not open."));
      dc.addEventListener("message", (e) => this.#handle(JSON.parse(e.data)));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const resp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${value}`, "Content-Type": "application/sdp" },
      });
      if (!resp.ok) throw new Error(`realtime calls ${resp.status}`);
      await pc.setRemoteDescription({ type: "answer", sdp: await resp.text() });
      this.#connectTimer = setTimeout(() => {
        if (this.state === "connecting") {
          this.#fail("The voice connection took too long to open.");
        }
      }, 10_000);
    } catch (e) {
      this.#fail(e instanceof Error ? e.message : String(e));
    }
  }

  #fail(message: string) {
    if (this.#connectTimer) clearTimeout(this.#connectTimer);
    this.error = message;
    this.state = "error";
  }

  #cleanup() {
    if (this.#connectTimer) clearTimeout(this.#connectTimer);
    try {
      this.#mic?.stop();
      this.#dc?.close();
      this.#pc?.close();
      this.#audio?.remove();
    } catch {
      // Already-closed browser media resources need no further work.
    }
    this.#connectTimer = undefined;
    this.#mic = undefined;
    this.#dc = undefined;
    this.#pc = undefined;
    this.#audio = undefined;
  }

  #send(obj: unknown) {
    if (this.#dc?.readyState === "open") this.#dc.send(JSON.stringify(obj));
  }

  async #handle(ev: any) {
    switch (ev.type) {
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        if (ev.transcript)
          this.captions = [...this.captions, { role: "tutor", text: ev.transcript }];
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (ev.transcript) {
          this.captions = [...this.captions, { role: "child", text: ev.transcript }];
          this.#onChild?.(ev.transcript);
        }
        break;
      case "output_audio_buffer.started":
        this.speaking = true;
        break;
      case "output_audio_buffer.stopped":
      case "response.done":
        this.speaking = false;
        break;
      case "response.function_call_arguments.done": {
        let args: Record<string, unknown> = {};
        try {
          args = ev.arguments ? JSON.parse(ev.arguments) : {};
        } catch {
          /* ignore */
        }
        const result = await this.#onTool(ev.name, args);
        this.#send({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: ev.call_id,
            output: JSON.stringify(result),
          },
        });
        this.#send({ type: "response.create" });
        break;
      }
    }
  }

  // Push the deterministic Verdict into the session as context; the model reacts.
  pushVerdict(summary: string) {
    this.#send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: summary }] },
    });
    this.#send({ type: "response.create" });
  }

  // Share live workspace state without interrupting the child with a new response.
  pushContext(summary: string) {
    this.#send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: summary }] },
    });
  }

  // Voice-first, never voice-only: typed replies enter the same constrained session.
  sendText(text: string) {
    const value = text.trim();
    if (!value) return;
    this.captions = [...this.captions, { role: "child", text: value }];
    this.#onChild?.(value);
    this.#send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: value }] },
    });
    this.#send({ type: "response.create" });
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.#mic) this.#mic.enabled = !this.muted;
  }

  shutdown() {
    this.#cleanup();
    this.state = "ended";
  }
}
