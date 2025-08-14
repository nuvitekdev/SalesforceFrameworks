public without sharing class WhistleblowerNewsFeedService {
  private static final String API_KEY = 'koeoY43AttLJKqygHMOM5ni2h7SnxO80t3wZ952L'; // Store securely
  private static final String CACHE_PARTITION_NAME = 'WhistleblowerNewsCachePartition';
  private static final String CACHE_KEY = 'WhistleblowerNews';

  @AuraEnabled(cacheable=true)
  public static List<NewsItem> getWhistleblowerNews() {
    Cache.OrgPartition cachePartition = Cache.Org.getPartition(
      CACHE_PARTITION_NAME
    );
    List<NewsItem> cachedNews = (List<NewsItem>) cachePartition.get(CACHE_KEY);

    if (cachedNews != null) {
      return cachedNews;
    }

    List<NewsItem> newsItems = makeAPICallAndParseResponse();
    cachePartition.put(CACHE_KEY, newsItems, 10800); // Cache for 3 hours (3 * 60 * 60)

    return newsItems;
  }

  private static List<NewsItem> makeAPICallAndParseResponse() {
    Http http = new Http();
    HttpRequest request = new HttpRequest();

    String queryParams =
      'api_token=' + EncodingUtil.urlEncode(API_KEY, 'UTF-8');
    queryParams +=
      '&search=' +
      EncodingUtil.urlEncode(
        'whistleblower+AND+federal+AND+government+AND+USA',
        'UTF-8'
      );
    queryParams += '&language=' + EncodingUtil.urlEncode('en', 'UTF-8');
    queryParams += '&limit=' + '3'; // Set the limit to 3
    // Add a random seed to the query to vary the results
    Integer randomSeed = (Integer) Math.floor(Math.random() * 1000);
    queryParams += '&randomSeed=' + randomSeed;

    request.setEndpoint(
      'callout:TheNewsAPICredential/v1/news/all?' + queryParams
    );
    request.setMethod('GET');

    HttpResponse response = http.send(request);
    if (response.getStatusCode() == 200) {
      return parseNews(response.getBody());
    } else {
      System.debug('Error fetching news: ' + response.getBody());
      return new List<NewsItem>();
    }
  }

  private static List<NewsItem> parseNews(String jsonResponse) {
    List<NewsItem> newsItems = new List<NewsItem>();
    Map<String, Object> jsonMap = (Map<String, Object>) JSON.deserializeUntyped(
      jsonResponse
    );
    List<Object> articles = (List<Object>) jsonMap.get('data');
    for (Object articleObj : articles) {
      Map<String, Object> article = (Map<String, Object>) articleObj;
      NewsItem item = new NewsItem();
      item.source = (String) article.get('source');
      item.title = (String) article.get('title');
      item.description = (String) article.get('description');
      item.imageUrl = (String) article.get('image_url');
      item.url = (String) article.get('url');
      newsItems.add(item);
    }
    return newsItems;
  }

  public class NewsItem {
    @AuraEnabled
    public String source;
    @AuraEnabled
    public String title;
    @AuraEnabled
    public String description;
    @AuraEnabled
    public String imageUrl;
    @AuraEnabled
    public String url;
  }
}
