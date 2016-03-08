(function() {
  'use strict';

  var mainTemplateUrl = chrome.extension.getURL('templates/main.html');
  var rankingTemplateUrl = chrome.extension.getURL('templates/ranking.html');
  var buttonTemplateUrl = chrome.extension.getURL('templates/button.html');
  var graphButton = $('.js-selected-navigation-item.reponav-item').last();
  var bugspotsButton = $('.js-selected-navigation-item[aria-label=Bugspots]');
  var re = /^http[s]?:[/]+github.com[/]*([^/]*)\/([^/]*)[/]?.*$/;
  var parsedUrl = re.exec(location.href);
  var userName = parsedUrl[1];
  var repoName = parsedUrl[2].split('#')[0];

  /* currentTimestamp is used for calculation of score */
  var currentTimestamp = new Date().getTime();
  var oldestCommitTimestamp = 0;

  /* bugDetectionRegex is used for judging whether given commits are bug fix or not */
  var bugDetectionRegexString = localStorage.getItem('bugspots-bug-detection-regex') || '[f|F]ix(es|ed)?|[C|c]lose(s|d)?]';
  var bugDetectionRegex = new RegExp(bugDetectionRegexString);

  /* accessToken is used for accessing private repositories */
  var accessToken = localStorage.getItem('bugspots-access-token');

  var githubClient = new Github({
    apiUrl: 'https://api.github.com',
    token: accessToken,
    auth: 'oauth'
  });

  var repo = githubClient.getRepo(userName, repoName);

  Handlebars.registerHelper('if_eq', function(a, b, opts) {
    if(a == b)
      return opts.fn(this);
    else
      return opts.inverse(this);
  });

  function selectNavigationItem() {
    $('.js-selected-navigation-item.selected').removeClass('selected');
    bugspotsButton.addClass('selected');
  }

  function renderButton() {
    return $.get(buttonTemplateUrl, function (loadedHtml) {
      var templateHtmlString = $(loadedHtml).html();
      graphButton.parent().append(templateHtmlString);
      bugspotsButton = $('#bugspotNavItem');
      bugspotsButton.click(selectNavigationItem);
      bugspotsButton.click(clickBugspotsButton);
    });
  }

  function renderMain(renderInfo) {
    var templateInfo = renderInfo || {};
    templateInfo['bugDetectionRegex'] = bugDetectionRegexString;
    templateInfo['accessToken'] = accessToken;
    return $.get(mainTemplateUrl, function (loadedHtml) {
      var templateHtmlString = $(loadedHtml).html();
      var template = Handlebars.compile(templateHtmlString);
      var resultHtmlString = template(templateInfo);
      $('#js-repo-pjax-container > .container').html(resultHtmlString);
      activateJsEventHandler();
    });
  }

  function renderRanking(renderInfo) {
    var templateInfo = renderInfo || {};
    return $.get(rankingTemplateUrl, function (loadedHtml) {
      var templateHtmlString = $(loadedHtml).html();
      var template = Handlebars.compile(templateHtmlString);
      var resultHtmlString = template(templateInfo);
      $('#jsRankingResult').replaceWith(resultHtmlString);
    });
  }

  function activateJsEventHandler(){
    $('#jsBugspotsSaveButton').click(function(){
      /* update bug detection regex */
      bugDetectionRegexString = $('#bugspotsRegexField').val();
      localStorage.setItem('bugspots-bug-detection-regex', bugDetectionRegexString);
      bugDetectionRegex = new RegExp(bugDetectionRegexString);

      /* update token */
      accessToken = $('#bugspotsTokenField').val();
      localStorage.setItem('bugspots-access-token', accessToken);
    });
  }

  function clickBugspotsButton() {
    /*
     * -- to debug --
     * var _test = {
     *  summary: [
     *   { path: "buggy-text",
     *     url: "https://...",
     *     score: 0.1 }
     * ]};
     * renderMain(_test);
     */

    renderMain({});
    repo.getCommits({'sha': 'master', 'perpage': 100}, analyzeCommits);
  }

  function analyzeCommits(err, commits) {
    var promiseList = [];

    if (err) { renderMain({error: true, errorType: '403'}); return; }

    var fix_commits = _.filter(commits, function (c) {
      return Boolean(c.commit.message.match(bugDetectionRegex));
    });

    if (fix_commits.length == 0) {
      renderMain({error: true, errorType: 'NoCommits'});
      return;
    }

    oldestCommitTimestamp = (new Date(fix_commits[fix_commits.length - 1].commit.author.date)).getTime();

    _.each(fix_commits, function (v) {
      var p = new Promise(function(res, _rej) {
        getCommit(repoName, userName, v.sha)
          .then(createRenderingInfo)
          .then(res);
      });
      promiseList.push(p);
    });

    Promise.all(promiseList).then(function(renderInfo) {
      var summary = {};
      _.each(renderInfo, function (v) {
        if (v.path in summary) { summary[v.path].score += v.score; }
        else { summary[v.path] = v; }
      });

      var summaryInfo = [];
      $.each(summary, function (k, v) {
        summaryInfo.push({path: k, score: v.score.toFixed(4), url: v.url})
      });
      var sortedSummary = _.sortBy(summaryInfo, 'score').reverse();
      renderRanking({summary: sortedSummary});
    });
  }

  function getCommit(repo, owner, sha) {
    return new Promise(function(resolve, reject) {
      var _url = 'https://api.github.com/repos/' + owner + '/' + repo + '/commits/' + sha;
      var _token = localStorage.getItem('bugspots-access-token');
      if (_token) _url += '?access_token=' + _token;
      $.ajax({ url: _url, type: 'GET', success: resolve, error: reject })
    });
  }

  function createRenderingInfo(commitInfo) {
    return new Promise(function (resolve, _reject) {
      var timestamp = (new Date(commitInfo.commit.author.date)).getTime();
      var normalizedTimestamp = (currentTimestamp - oldestCommitTimestamp) / (currentTimestamp - timestamp);
      var score = 1 / (1 + Math.exp(12.0 * (1.0 - normalizedTimestamp)));

      _.each(commitInfo.files, function (f) {
        var blameUrl = 'https://github.com/' + userName + '/' + repoName + '/blame/master/' + f.filename;
        resolve({path: f.filename, url: blameUrl, timestamp: timestamp, score: score})
      });
    });
  }

  function initialize() {
    renderButton();
  }

  initialize();

})();
