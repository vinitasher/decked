/* One manual dashboard ad. No Auto ads, session placements, or paid-user ads. */
const FreeAds = {
  _load: null,
  _version: 0,
  _mounted: false,

  async render(config, eligible) {
    const version = ++this._version;
    const host = document.getElementById('free-ad');
    const slot = document.getElementById('free-ad-slot');
    if (!host || !slot) return;
    if (!eligible || !config || !/^ca-pub-\d{16}$/.test(config.client)
        || !/^\d{10}$/.test(config.slot)) {
      slot.replaceChildren();
      host.classList.add('hidden');
      this._mounted = false;
      return;
    }
    if (this._mounted) return;
    try {
      if (!this._load) {
        this._load = new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.async = true;
          script.crossOrigin = 'anonymous';
          script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.client}`;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      await this._load;
      if (version !== this._version) return;
      const ad = document.createElement('ins');
      ad.className = 'adsbygoogle free-ad-unit';
      ad.style.display = 'block';
      ad.setAttribute('data-ad-client', config.client);
      ad.setAttribute('data-ad-slot', config.slot);
      ad.setAttribute('data-ad-format', 'horizontal');
      slot.replaceChildren(ad);
      host.classList.remove('hidden');
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      this._mounted = true;
    } catch (_) {
      // Ad blockers and unavailable inventory must not interrupt practice.
      slot.replaceChildren();
      host.classList.add('hidden');
    }
  }
};
