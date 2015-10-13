(function() {
  'use strict';

  var mainTemplateUrl = chrome.extension.getURL('templates/main.html');
  var buttonTemplateUrl = chrome.extension.getURL('templates/button.html');
  var re = /^http[s]?:[/]+github.com[/]*([^/]*)\/([^/]*)[/|#].*$/;
  var parsedUrl = re.exec(location.href);
  var userName = parsedUrl[1];
  var repoName = parsedUrl[2];

  /* currentTimestamp is used for calculation of score */
  var currentTimestamp = (new Date()).getTime();

  /* bugDetectionRegex is used for judging whether given commits are bug fix or not */
  var bugDetectionRegexString = localStorage.getItem('bugspots-bug-detection-regex') || '[f|F]ix(es|ed)?|[C|c]lose(s|d)?]';
  var bugDetectionRegex = new RegExp(bugDetectionRegexString);

  /* accessToken is used for accessing private repositories */
  var accessToken = localStorage.getItem('bugspots-access-token');

  var githubClient = new Github({
    apiUrl: 'https://api.github.com',
    token: accessToken,
    auth: "oauth"
  });

  var repo = githubClient.getRepo(userName, repoName);

  function renderButton() {
    return $.get(buttonTemplateUrl, function (loadedHtml) {
      var templateHtmlString = $(loadedHtml).html();
      $('.tooltipped.tooltipped-w[aria-label=Graphs]').parent().append(templateHtmlString);

      var bugspotsButton = $('.js-selected-navigation-item[aria-label=Bugspots]');

      bugspotsButton.click(selectNavigationItem);
      //bugspotsButton.click(renderMain);
      bugspotsButton.click(getCommits);

      function selectNavigationItem() {
        $('.js-selected-navigation-item.selected').removeClass('selected');
        bugspotsButton.addClass('selected');
      }
    });
  }

  function renderMain(renderInfo) {
    renderInfo['bugDetectionRegex'] = bugDetectionRegexString;
    renderInfo['accessToken'] = accessToken;

    return $.get(mainTemplateUrl, function (loadedHtml) {
      var templateHtmlString = $(loadedHtml).html();
      var template = Handlebars.compile(templateHtmlString);
      var resultHtmlString = template(renderInfo);
      $('#js-repo-pjax-container').html(resultHtmlString);
      activateJsEventHandler();
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

  function renderSourceTable(err, tree) {
    var files = _.filter(tree, function (i) {
      return i.type == "blob"
    });
  }

  function getCommits() {
    //var _test = {
    //  summary: [
    //    { path: "Gemfile", score: 0.00000614417460221472, url: "https://api.github.com/repos/travelist/dependency-inspector/git/blobs/8975a62227846f6aed69702e4ed982323bde707d" },
    //    { path: "Gemfile", score: 0.00000614417460221472, url: "https://api.github.com/repos/travelist/dependency-inspector/git/blobs/8975a62227846f6aed69702e4ed982323bde707d" }
    //  ]
    //};
    //renderMain(_test);
    repo.getCommits({'sha': 'master', 'perpage': 100}, analyzeCommits);
  }

  function analyzeCommits(err, commits) {
    var info = [];
    var fix_commits = _.filter(commits, function (c) {
      return Boolean(c.commit.message.match(bugDetectionRegex));
    });
    var oldestCommitTimestamp = (new Date(fix_commits[fix_commits.length - 1].commit.author.date)).getTime();

    $.each(fix_commits, function (i, v) {
      $.get(v.commit.tree.url + '?recursive=true').then(function (r) {

        var timestamp = (new Date(v.commit.author.date)).getTime();
        var normalizedTimestamp = (timestamp - oldestCommitTimestamp) / currentTimestamp;
        var score = 1 / (1 + Math.exp(12.0 * (1.0 - normalizedTimestamp)));
        var files = _.filter(r.tree, function (t) {
          return t.type == "blob"
        });

        $.each(files, function (i, v) {
          var blameUrl = 'https://github.com/'+userName+'/'+repoName+'/blame/master/'+ v.path;
          info.push({path: v.path, url: blameUrl, timestamp: timestamp, score: score});
        });

      }).then(function (r) {
        if (i == fix_commits.length - 1) {
          var summary = {};

          $.each(info, function (i, v) {
            if (v.path in summary) {
              summary[v.path].score += v.score;
            }
            else {
              summary[v.path] = v;
            }
          });

          var summaryInfo = [];
          $.each(summary, function (k, v) {
            summaryInfo.push({path: k, score: v.score, url: v.url})
          });
          _.sortBy(summaryInfo, 'score');
          renderMain({summary: summaryInfo});
        }
      });
    });
  }

  function _saveObject(key, obj) {
    return localStorage.setItem(key, JSON.stringify(obj));
  }

  function _getObject(key) {
    return JSON.parse(localStorage.getItem(key));
  }

  function initialize() {
    renderButton();
  }

  initialize();
})();
