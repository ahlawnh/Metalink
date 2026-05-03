"use client";

import {
  ConnectionStateToast,
  RoomAudioRenderer,
  StartAudio,
  TrackToggle,
  VideoTrack,
  isTrackReference,
  useTracks,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";

/**
 * FaceTime-like layout for bystanders: solo = fullscreen self; remote joins with camera =
 * remote fullscreen + local picture-in-picture.
 */
export default function FaceTimeCallLayout() {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    {
      onlySubscribed: false,
      updateOnlyOn: [
        RoomEvent.ParticipantConnected,
        RoomEvent.ParticipantDisconnected,
        RoomEvent.TrackSubscribed,
        RoomEvent.TrackUnsubscribed,
        RoomEvent.LocalTrackPublished,
        RoomEvent.LocalTrackUnpublished,
      ],
    }
  );

  const subscribed = tracks.filter(isTrackReference);
  const localCam = subscribed.find((t) => t.participant.isLocal);
  const remoteCams = subscribed.filter((t) => !t.participant.isLocal);

  const hasRemoteVideo = remoteCams.length > 0;
  const mainTrack = hasRemoteVideo ? remoteCams[0] : localCam;
  const pipTrack = hasRemoteVideo ? localCam : undefined;

  /** Solo: large immersive stage (most of the viewport). With dispatch video: compact framed call. */
  const stageShell = hasRemoteVideo
    ? "relative mx-auto aspect-video w-full max-w-3xl overflow-hidden rounded-2xl bg-neutral-950 shadow-inner ring-1 ring-black/10 max-h-[min(48vh,520px)] sm:max-h-[min(54vh,580px)]"
    : "relative mx-auto min-h-[min(78dvh,820px)] w-full max-w-none overflow-hidden rounded-2xl bg-neutral-950 shadow-inner ring-1 ring-black/10 sm:min-h-[min(72vh,760px)]";

  return (
    <>
      <div className={stageShell}>
        {mainTrack && isTrackReference(mainTrack) ? (
          <div className="absolute inset-0">
            <VideoTrack
              trackRef={mainTrack}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="flex min-h-[min(78dvh,820px)] items-center justify-center px-6 text-center text-sm text-white/55 sm:min-h-[min(72vh,760px)]">
            Starting camera…
          </div>
        )}

        {pipTrack && isTrackReference(pipTrack) ? (
          <div
            className="absolute bottom-4 right-4 z-10 aspect-video w-[34%] max-w-[176px] overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl ring-[3px] ring-white"
            aria-label="Your camera"
          >
            <div className="h-full w-full scale-x-[-1]">
              <VideoTrack
                trackRef={pipTrack}
                className="h-full w-full object-cover"
              />
            </div>
            <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              You
            </span>
          </div>
        ) : null}

        <RoomAudioRenderer />
        <ConnectionStateToast />
      </div>

      <div className="flex flex-col items-center gap-3 px-2 pt-4">
        <StartAudio label="Tap to play dispatch audio" />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <TrackToggle source={Track.Source.Microphone} />
          <TrackToggle source={Track.Source.Camera} />
        </div>
      </div>
    </>
  );
}
