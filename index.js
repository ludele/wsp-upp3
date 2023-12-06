import { promises as fs } from "fs";
import { createServer } from "http";
import { MongoClient, ObjectId } from "mongodb";
import { serveFile } from './fileServer.mjs';

const port = 3000;

let mongoConn;

async function handleRequest(request, response) {
    function statusCodeResponse(code, value, type) {
        response.writeHead(code, { 'Content-Type': `${type}` });
        response.write(value);
        response.end();
    }

    async function getBody(request) {
        return new Promise(async function (resolve, reject) {
            let chunks = [];

            request.on("data", function (chunk) {
                chunks.push(chunk);
            });

            request.on("error", function (err) {
                reject(err);
            });

            request.on("end", function () {
                try {
                    let data = Buffer.concat(chunks).toString();
                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    async function saveToDatabase(title, text) {
        if (!mongoConn) {
            console.log("Attempting to connect to MongoDB...");
            mongoConn = await MongoClient.connect("mongodb://127.0.0.1:27017");
            console.log("MongoDB Connected successfully!");
        }
        let db = mongoConn.db("lektion6");

        let result = await db.collection("posts").insertOne({
            title: title,
            text: text
        });

        return result.insertedId;
    }

    async function retrieveFromDatabase(postId) {
        if (!mongoConn) {
            console.log("Attempting to connect to MongoDB...");
            mongoConn = await MongoClient.connect("mongodb://127.0.0.1:27017");
            console.log("MongoDB Connected successfully!");
        }
        let db = mongoConn.db("lektion6");

        return await db.collection("posts").findOne({
            _id: new ObjectId(postId)
        });
    }

    function generatePostHTML(post) {
        return `
          <div class="post">
              <h2 class="post-title"><a href="/post?postid=${post._id}">${post.title}</a></h2>
              <p class="box">${post.text.substring(0, 100)}</p>
          </div>
      `;
    }

    async function renderPostsPreviews(posts) {
        let template = (await fs.readFile("./templates/postspreviews.maru")).toString();
        let previewsHTML = posts.map(post => generatePostHTML(post)).join('');
        template = template.replace(/%previews%/g, previewsHTML);
        return template;
    }

    async function renderPost(post) {
        let template = (await fs.readFile("./templates/post.maru")).toString();
        template = template.replace(/%title%/g, post.title);
        template = template.replace(/%text%/g, post.text);
        return template;
    }

    async function renderPostsPreviews(posts) {
        let template = (await fs.readFile("./templates/postspreviews.maru")).toString();
        let previewsHTML = "";

        posts.forEach(post => {
            previewsHTML += `
            <div class="box">
                <h2>
                    <a href="/post?postid=${post._id}">${post.title}</a>
                </h2>
                    <p>
                        ${post.text.substring(0, 1000)} ...
                    </p>
            </div>`;
        });

        template = template.replace(/%previews%/g, previewsHTML);
        return template;
    }

    if (request.url.startsWith('/public/')) {
        await serveFile(request, response);
        return;
    }

    try {
        console.log("Handling Request...");

        let url = new URL(request.url, "http://" + request.headers.host);
        let path = url.pathname;
        let pathSegments = path.split("/").filter(function (element) {
            return element !== "";
        });

        if (pathSegments.length === 0) {
            let template = (await fs.readFile("./templates/index.maru")).toString();

            const links = [
                { text: "Write a Post", href: "/writepost" },
                { text: "All Posts", href: "/posts" },
            ];

            const dynamicLinks = links.map(link => `<li><a href="${link.href}">${link.text}</a></li>`).join('');

            template = template.replace("%title%", "Forum");
            template = template.replace("%DynamicLinks%", dynamicLinks);

            statusCodeResponse(200, template, "text/html");
            console.log("Request Handled Successfully");
            return;
        }

        let seg = pathSegments.shift();

        if (seg === "writepost" && request.method === "GET") {
            let form = (await fs.readFile("./templates/writepost.maru")).toString();
            statusCodeResponse(200, form, "text/html");
            console.log("Write Post Form Sent");
            return;
        } else if (seg === "writepost" && request.method === "POST") {
            let data = await getBody(request);
            let params = new URLSearchParams(data);

            let postTitle = params.get("title");
            let postText = params.get("text");

            try {
                let postId = await saveToDatabase(postTitle, postText);

                response.writeHead(302, { 'Location': `/post?postid=${postId}` });
                response.end();
                console.log("Post Created and Redirected");
            } catch (error) {
                console.error("Error in Post Creation:", error);
                statusCodeResponse(409, "Conflict in creation", "text/plain");
            }
        } else if (seg === "post" && request.method === "GET") {
            let postId = url.searchParams.get("postid");
            let post = await retrieveFromDatabase(postId);

            if (!post) {
                console.error("Post Not Found");
                statusCodeResponse(404, "404 Not Found", "text/plain");
                return;
            }

            let postPage = await renderPost(post);
            statusCodeResponse(200, postPage, "text/html");
            console.log("Post Rendered");
        } else if (seg === "posts" && request.method === "GET") {
            try {
                if (!mongoConn) {
                    console.log("Attempting to connect to MongoDB...");
                    mongoConn = await MongoClient.connect("mongodb://127.0.0.1:27017");
                    console.log("MongoDB Connected successfully");
                }
                let db = mongoConn.db("lektion6");

                let allPosts = await db.collection("posts").find().toArray();

                let postsPreviewPage = await renderPostsPreviews(allPosts);
                statusCodeResponse(200, postsPreviewPage, "text/html");
                console.log("All Posts Previews Rendered");
            } catch (error) {
                console.error("Error Retrieving All Posts Previews:", error.message);
                statusCodeResponse(500, "Internal Server Error", "text/plain");
            }
        } else {
            console.log("404 Not Found");
            statusCodeResponse(404, "404 Not Found", "text/plain");
        }
    } catch (error) {
        console.error("Error Handling Request:", error.message);
        statusCodeResponse(500, "Internal Server Error", "text/plain");
    }
}

let app = createServer(handleRequest);

app.listen(port, function () {
    console.log(`Server listening on port ${port}`);
});