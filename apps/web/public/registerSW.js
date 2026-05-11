(function () {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', function () {
    navigator.serviceWorker
      .getRegistrations()
      .then(function (registrations) {
        return Promise.all(
          registrations.map(function (registration) {
            return registration.unregister();
          }),
        );
      })
      .then(function () {
        if (!('caches' in window)) return undefined;
        return caches.keys().then(function (keys) {
          return Promise.all(
            keys.map(function (key) {
              return caches.delete(key);
            }),
          );
        });
      })
      .catch(function () {});
  });
})();
