/* Silent Victory "Fight Card" matchmaker + mobile action bar.
   - Renders a 2-step program picker into any element with id="matchmaker".
   - Adds a sticky Call / Text / Start bar on phones, on every page that loads this file. */
(function () {
  var PHONE = '+18143227129', PHONE_TXT = '(814) 322-7129', EMAIL = 'SilentVictory.Shane@gmail.com';
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  function sms(body) { return 'sms:' + PHONE + (isIOS ? '&' : '?') + 'body=' + encodeURIComponent(body); }
  function mail(subject, body) { return 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body); }

  var WHO = [
    { k: 'kid', label: 'My Kid', sub: 'Youth athlete', phrase: 'my child' },
    { k: 'teen', label: 'My Teen', sub: 'Middle / high school', phrase: 'my teenager' },
    { k: 'adult', label: 'Me', sub: 'Adult, any level', phrase: 'myself' },
    { k: 'comp', label: 'A Competitor', sub: 'Chasing titles', phrase: 'a competitive athlete' }
  ];
  var GOAL = [
    { k: 'wrestling', label: 'Wrestling', sub: 'Takedowns & mat IQ', url: 'services.html#wrestling' },
    { k: 'jiu-jitsu', label: 'Jiu-Jitsu', sub: 'Leverage & submissions', url: 'services.html#jiu-jitsu' },
    { k: 'strength', label: 'Strength', sub: 'Power & conditioning', url: 'services.html#personalized-training' },
    { k: 'unsure', label: 'Not Sure Yet', sub: 'Help me choose', url: 'services.html' }
  ];
  var NAME = { wrestling: 'Wrestling', 'jiu-jitsu': 'Jiu-Jitsu', strength: 'Strength Training', unsure: 'A Custom Mix' };
  var PITCH = {
    wrestling: 'Learn the sport from a coach who has produced 38 All-Americans and 4 national champions. Technique, strategy and mental toughness from day one.',
    'jiu-jitsu': 'Train with an undefeated pro grappler (7-0-1). Build leverage, control and submission skills in a focused, respectful room.',
    strength: 'Technique-first strength and conditioning to build power, endurance and durability, whether for sport or for life.',
    unsure: 'Most of our athletes blend wrestling, Jiu-Jitsu and strength work. Tell Shane your goals and he will map out where to start.'
  };
  var COMP_NOTE = 'Competition prep available: individualized coaching for athletes chasing state and national titles.';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function initMatchmaker(root) {
    var state = { who: null, goal: null };

    function choice(list, step) {
      return '<div class="mm-grid">' + list.map(function (o) {
        return '<button type="button" class="mm-opt" data-step="' + step + '" data-k="' + o.k + '"><b>' + esc(o.label) + '</b><span>' + esc(o.sub) + '</span></button>';
      }).join('') + '</div>';
    }
    function dots(n) {
      return '<div class="mm-dots">' + [1, 2, 3].map(function (i) { return '<i class="' + (i <= n ? 'on' : '') + '"></i>'; }).join('') + '</div>';
    }

    function render() {
      var html;
      if (!state.who) {
        html = '<div class="mm-head"><span class="mm-kicker">Round 1 of 2</span>' + dots(1) + '</div>' +
          '<h2 class="mm-q">Who\'s training?</h2>' + choice(WHO, 'who');
      } else if (!state.goal) {
        html = '<div class="mm-head"><button type="button" class="mm-back" data-back="who">&larr; Back</button>' + dots(2) + '</div>' +
          '<h2 class="mm-q">What do you want to build?</h2>' + choice(GOAL, 'goal');
      } else {
        var w = WHO.filter(function (o) { return o.k === state.who; })[0];
        var g = GOAL.filter(function (o) { return o.k === state.goal; })[0];
        var prog = NAME[g.k];
        var msg = 'Hi Shane! I found Silent Victory online and I\'m interested in ' +
          (g.k === 'unsure' ? 'training' : prog) + ' for ' + w.phrase + '. When would be a good time to come by for a first visit?';
        html = '<div class="mm-head"><button type="button" class="mm-back" data-back="goal">&larr; Back</button>' + dots(3) + '</div>' +
          '<div class="mm-card">' +
            '<div class="mm-card-top"><span>Your Fight Card</span><span>' + esc(w.label) + '</span></div>' +
            '<div class="mm-vs"><b>' + esc(prog) + '</b><em>with Coach Shane Valko</em></div>' +
            '<p>' + esc(PITCH[g.k]) + (state.who === 'comp' ? ' ' + esc(COMP_NOTE) : '') + '</p>' +
          '</div>' +
          '<div class="mm-actions">' +
            '<a class="btn mm-text" href="' + sms(msg) + '">Text Shane <span class="arr">&rarr;</span></a>' +
            '<a class="btn ghost" href="tel:' + PHONE + '">Call ' + PHONE_TXT + '</a>' +
          '</div>' +
          '<div class="mm-foot"><a href="' + mail('First visit: ' + prog, msg) + '">Prefer email?</a><a href="' + g.url + '">See the program &rarr;</a></div>' +
          '<p class="mm-preview"><small>Your message, ready to send:</small>&ldquo;' + esc(msg) + '&rdquo;</p>';
      }
      root.innerHTML = html;
      var first = root.querySelector('.mm-opt, .mm-text');
      if (render.touched && first) first.focus({ preventScroll: true });
    }

    root.addEventListener('click', function (e) {
      var opt = e.target.closest('.mm-opt'), back = e.target.closest('.mm-back');
      if (opt) { state[opt.getAttribute('data-step')] = opt.getAttribute('data-k'); }
      else if (back) {
        var b = back.getAttribute('data-back');
        state.goal = null; if (b === 'who') state.who = null;
      } else return;
      render.touched = true;
      root.classList.remove('mm-anim'); void root.offsetWidth; root.classList.add('mm-anim');
      render();
    });
    render();
  }

  function initActionBar() {
    if (document.querySelector('.mbar')) return;
    var onHome = !!document.getElementById('matchmaker');
    var bar = document.createElement('nav');
    bar.className = 'mbar';
    bar.setAttribute('aria-label', 'Quick contact');
    bar.innerHTML =
      '<a href="tel:' + PHONE + '"><svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>Call</a>' +
      '<a href="' + sms('Hi Shane! I found Silent Victory online and want to set up a first visit.') + '"><svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z"/></svg>Text</a>' +
      '<a class="go" href="' + (onHome ? '#matchmaker' : 'index.html#matchmaker') + '">Find My Program &rarr;</a>';
    document.body.appendChild(bar);
    document.body.classList.add('has-mbar');
  }

  function boot() {
    var root = document.getElementById('matchmaker');
    if (root) initMatchmaker(root);
    initActionBar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
