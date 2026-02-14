/* js/search.js -- Nominatim geocoding search with debounce */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var debounceTimer = null;
  var lastQuery = '';
  var results = [];
  var selectedDestination = null;
  var lastSearchTime = 0;

  function init() {
    var input = document.getElementById('searchInput');
    if (!input) return;

    input.addEventListener('input', function () {
      var q = input.value.trim();
      var clearBtn = document.getElementById('clearSearch');

      if (q.length < 2) {
        hideResults();
        if (clearBtn) clearBtn.style.display = q.length > 0 ? 'flex' : 'none';
        return;
      }
      if (clearBtn) clearBtn.style.display = 'flex';

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        doSearch(q);
      }, 300);
    });

    input.addEventListener('focus', function () {
      if (results.length > 0 && input.value.length >= 2 && !selectedDestination) {
        renderResults(results);
      }
    });

    // Close results on outside click
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#searchBar') && !e.target.closest('#searchResults')) {
        hideResults();
      }
    });

    // ESC key closes results
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        hideResults();
        input.blur();
      }
    });
  }

  function doSearch(query) {
    if (query === lastQuery) return;
    lastQuery = query;

    // Respect Nominatim rate limit: 1 req/sec
    var now = Date.now();
    var wait = Math.max(0, 1000 - (now - lastSearchTime));

    setTimeout(function () {
      lastSearchTime = Date.now();

      var url = 'https://nominatim.openstreetmap.org/search?q=' +
        encodeURIComponent(query) +
        '&format=json&limit=5&countrycodes=ae&viewbox=51,22,57,27&bounded=1';

      fetch(url, {
        headers: { 'Accept': 'application/json' }
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (query !== lastQuery) return; // stale
          results = data || [];
          renderResults(results);
        })
        .catch(function (err) {
          console.warn('Nominatim error:', err);
        });
    }, wait);
  }

  function renderResults(data) {
    var container = document.getElementById('searchResults');
    if (!container) return;

    // Position below search bar
    var bar = document.getElementById('searchBar');
    if (bar) {
      var rect = bar.getBoundingClientRect();
      container.style.top = (rect.bottom + 4) + 'px';
    }

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="sr-empty">No results found</div>';
      container.style.display = 'block';
      return;
    }

    var html = '';
    data.forEach(function (item, idx) {
      var parts = item.display_name.split(',');
      var name = parts[0].trim();
      var detail = parts.slice(1, 3).join(',').trim();
      var type = (item.type || item.class || '').replace(/_/g, ' ');

      html += '<div class="sr-item" onclick="searchSelect(' + idx + ')">' +
        '<div class="sr-name">' + esc(name) + '</div>' +
        '<div class="sr-detail">' + esc(type) +
        (detail ? ' \u2022 ' + esc(detail) : '') +
        '</div></div>';
    });

    container.innerHTML = html;
    container.style.display = 'block';
  }

  function hideResults() {
    var c = document.getElementById('searchResults');
    if (c) c.style.display = 'none';
  }

  function select(idx) {
    if (!results[idx]) return null;
    var item = results[idx];
    var parts = item.display_name.split(',');

    selectedDestination = {
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      name: parts[0].trim(),
      fullName: item.display_name
    };

    var input = document.getElementById('searchInput');
    if (input) {
      input.value = selectedDestination.name;
      input.blur();
    }

    hideResults();

    var clearBtn = document.getElementById('clearSearch');
    if (clearBtn) clearBtn.style.display = 'flex';

    return selectedDestination;
  }

  function clear() {
    selectedDestination = null;
    results = [];
    lastQuery = '';

    var input = document.getElementById('searchInput');
    if (input) {
      input.value = '';
      input.blur();
    }

    var clearBtn = document.getElementById('clearSearch');
    if (clearBtn) clearBtn.style.display = 'none';

    hideResults();
  }

  function getDestination() { return selectedDestination; }

  function esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  DR.search = {
    init: init,
    select: select,
    clear: clear,
    getDestination: getDestination,
    hideResults: hideResults
  };
})();
