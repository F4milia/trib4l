// The service worker exists so that Wave 4 has one to extend. It is
// deliberately empty of behaviour.
//
// WHY IT SHIPS EMPTY, AND SEPARATELY FROM ANY FEATURE
// ---------------------------------------------------
// N1 (Wave 4, Stream A) adds web push. W2 (Wave 4, Stream B) builds the
// installed-PWA first-run. Both need this file, they run in the same wave in
// parallel worktrees, and the run doc's Wave 4 note mentions neither
// dependency -- so both sessions would have created it. Two sessions creating
// one file is not a merge conflict that surfaces cleanly; it is one worker
// silently winning while the other session's registration path assumes
// behaviour that is no longer there.
//
// So the file lands first, owned by neither, and each session ADDS to it:
//
//   N1  adds a `push` listener and a `notificationclick` listener.
//   W2  adds whatever the installed shell needs, if anything.
//
// N1 must not put Family content in a notification body. Invariant 3: name the
// event, never the content, because the device may be someone else's. That
// belongs here as a comment because this is the file where the temptation
// arrives.
//
// No fetch handler, on purpose. An offline cache is a product decision about
// what a Family sees when the network is gone, and nothing in the run doc has
// made it. An empty worker is honest; a caching worker nobody specified would
// serve stale Family content.

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every tab to close. Without
  // this, a worker update sits idle behind an open tab, and N1's push handler
  // would not arrive for whoever leaves the app open all day -- which is
  // exactly the person notifications are for.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
