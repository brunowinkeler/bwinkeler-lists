import { useEffect, useState } from 'react';
import { InstallIcon, PlusIcon, ShareIcon } from './icons';
import { APP_NAME } from '../config/brand';

/** Chrome-family install prompt. Not in lib.dom yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari reports the home-screen web app here instead.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isApplePlatform(): boolean {
  const { userAgent, maxTouchPoints } = navigator;
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  // iPadOS presents itself as a desktop Mac; touch points give it away.
  return userAgent.includes('Macintosh') && maxTouchPoints > 1;
}

/** Offers installation so the app runs without browser navigation chrome.
 * Chromium browsers get the native prompt; Apple browsers, which have no
 * programmatic prompt, get the manual "Add to Home Screen" steps instead. */
export function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isInstalled);
  const [showAppleSteps, setShowAppleSteps] = useState(false);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event): void {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    }
    function onInstalled(): void {
      setPromptEvent(null);
      setInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    const standalone = window.matchMedia('(display-mode: standalone)');
    const onDisplayModeChange = (event: MediaQueryListEvent): void => setInstalled(event.matches);
    standalone.addEventListener('change', onDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      standalone.removeEventListener('change', onDisplayModeChange);
    };
  }, []);

  const appleFallback = !promptEvent && isApplePlatform();
  if (installed || (!promptEvent && !appleFallback)) return null;

  async function install(): Promise<void> {
    if (!promptEvent) {
      setShowAppleSteps(true);
      return;
    }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    if (choice.outcome === 'accepted') setInstalled(true);
  }

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        onClick={() => void install()}
        aria-label={`Install ${APP_NAME}`}
        title={`Install ${APP_NAME}`}
      >
        <InstallIcon />
      </button>

      {showAppleSteps && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setShowAppleSteps(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-steps-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="install-steps-title">Install {APP_NAME}</h2>
            <p className="muted">
              Installed from the Home Screen, {APP_NAME} opens without the browser address bar or
              the bottom toolbar.
            </p>
            <ol className="install-steps">
              <li>
                <ShareIcon /> Open the Share menu in Safari.
              </li>
              <li>
                <PlusIcon /> Choose “Add to Home Screen”.
              </li>
              <li>Confirm with “Add”, then launch {APP_NAME} from the Home Screen.</li>
            </ol>
            <div className="modal__actions">
              <button type="button" className="primary" onClick={() => setShowAppleSteps(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
