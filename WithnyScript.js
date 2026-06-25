const PLATFORM = "Withny";
const BASE_URL = "https://www.withny.fun";

// --- Source Methods ---

source.enable = function (config, settings, savedState) {
    // 初期化処理
};

source.getHome = function () {
    const response = http.GET(BASE_URL, {});
    if (!response.isOk) return new VideoPager([], false);
    return parseVideoList(response.body);
};

source.search = function (query, type, order, filters) {
    const url = `${BASE_URL}/?tab=archives&q=${encodeURIComponent(query)}`;
    const response = http.GET(url, {});
    if (!response.isOk) return new VideoPager([], false);
    return parseVideoList(response.body);
};

source.isChannelUrl = function (url) {
    return url.includes("/user/profile/") || url.includes("/channels/");
};

source.getChannel = function (url) {
    const response = http.GET(url, {});
    if (!response.isOk) throw new Error("Failed to load channel");
    
    // シンプルな抽出例
    const nameMatch = response.body.match(/<h2[^>]*>(.*?)<\/h2>/);
    const name = nameMatch ? nameMatch[1] : "Unknown Cast";
    
    return new PlatformAuthorLink(
        new PlatformID(PLATFORM, url, plugin.config.id),
        name,
        url,
        ""
    );
};

source.getChannelContents = function (url, type) {
    const response = http.GET(url, {});
    if (!response.isOk) return new VideoPager([], false);
    return parseVideoList(response.body);
};

source.isContentDetailsUrl = function (url) {
    return url.includes("/channels/") || url.includes("/schedules/") || url.includes("/archives/");
};

source.getContentDetails = function (url) {
    const response = http.GET(url, {});
    if (!response.isOk) throw new Error("Failed to load content details");

    const titleMatch = response.body.match(/<h1[^>]*>(.*?)<\/h1>/) || response.body.match(/### (.*?)\n/);
    const title = titleMatch ? titleMatch[1].trim() : "Untitled";

    // m3u8の抽出
    const m3u8Match = response.body.match(/https:\/\/[^\s"'<>]+master\.m3u8/) || response.body.match(/https:\/\/[^\s"'<>]+playback\.live-video\.net\/api\/video\/v1\/[^\s"'<>]+m3u8/);
    const streamUrl = m3u8Match ? m3u8Match[0].replace(/\\/g, '') : "";

    const video = new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, url, plugin.config.id),
        name: title,
        thumbnails: new Thumbnails([]),
        author: new PlatformAuthorLink(new PlatformID(PLATFORM, "", plugin.config.id), "Cast", "", ""),
        description: "",
        video: new VideoSourceEnumerator([
            new VideoUrlSource({
                name: "HLS",
                url: streamUrl,
                container: "application/x-mpegURL"
            })
        ])
    });

    return video;
};

// --- Helpers ---

function parseVideoList(html) {
    const videos = [];
    // Next.jsのJSONデータまたはHTMLから抽出
    // 簡易的に正規表現でリンクとタイトルを抽出する例
    const regex = /href="(\/(?:channels|schedules|archives)\/[a-zA-Z0-9_-]+)"[^>]*>.*?### (.*?)\n/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const url = BASE_URL + match[1];
        const title = match[2].trim();
        videos.push(new PlatformVideo({
            id: new PlatformID(PLATFORM, url, plugin.config.id),
            name: title,
            thumbnails: new Thumbnails([]),
            author: new PlatformAuthorLink(new PlatformID(PLATFORM, "", plugin.config.id), "Cast", "", ""),
            url: url
        }));
    }
    return new VideoPager(videos, false);
}
