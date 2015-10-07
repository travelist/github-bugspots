(function() {
  'use strict';

  var mainTemplateUrl = chrome.extension.getURL('templates/main.html');
  var buttonTemplateUrl = chrome.extension.getURL('templates/button.html');
  var re =/^http[s]?:[/]+github.com[/]*([^/]*)\/([^/]*)[/|#].*$/;
  var parsedUrl = re.exec(location.href);
  var userName = parsedUrl[1];
  var repoName = parsedUrl[2];
  var githubClient = new Github({'apiUrl': 'https://api.github.com'});
  var repo = githubClient.getRepo(userName, repoName);

  function renderButton() {
    $.get(buttonTemplateUrl, null, function (loadedHtml) {
      var templateHtmlString = $(loadedHtml).html();
      $('.tooltipped.tooltipped-w[aria-label=Graphs]').parent().append(templateHtmlString);

      var bugspotsButton = $('.js-selected-navigation-item[aria-label=Bugspots]');

      bugspotsButton.click(selectNavigationItem);
      bugspotsButton.click(renderMain);

      function selectNavigationItem() {
        $('.js-selected-navigation-item.selected').removeClass('selected');
        bugspotsButton.addClass('selected');
      }
    });
  }

  function renderMain() {
    $.get(mainTemplateUrl, null, function (loadedHtml) {
      var templateHtmlString = $(loadedHtml).html();
      var template = $.templates(templateHtmlString);
      var resultHtmlString = template.render({"name": "test"});
      $('#js-repo-pjax-container').html(resultHtmlString);
      getSourceTree();
      getCommits();
    });
  }

  function getSourceTree() {
    repo.getTree('master?recursive=true', renderSourceTable);
  }

  function renderSourceTable(err, tree) {
    console.log(tree);
    var files = _.filter(tree, function(i){ return i.type == "blob" });
    console.log(files);
  }

  function getCommits() {
    repo.getCommits({
      'sha': 'master',
      'perpage': 100
    }, analyzeCommits);
  }

  function analyzeCommits(err, commits){
    console.log(commits);
  }

  function initialize() {
    renderButton();
  }

  initialize();

})();
