const express = require('express')
const axios = require('axios');
require('dotenv').config();

const app = express()
const port = 3000

//// 

class Store {
    // constructor(name) {
    //     // this.name = name;
    //     // this.log = new Changelog(new Date())
    // }
    get_instance() {
        if (!Store.log) {
            Store.log = new Changelog(new Date());
        }
        return Store.log;
    }
}

class ChangelogItem {
    constructor(date, description) {
        this.date = new Date(date);
        this.description = description;
    }

    toString() {
        return `${this.date.toISOString().split('T')[0]}: ${this.description}`;
    }
}

class Changelog {
    constructor(startDate, endDate) {
        this.startDate = new Date(startDate);
        // this.endDate = new Date(endDate);
        this.items = [];
    }

    addItem(date, description) {
        const item = new ChangelogItem(date, description);
        if (item.date >= this.startDate) {
            this.items.push(item);
            this.items.sort((a, b) => b.date - a.date); // Sort in descending order
        } else {
            throw new Error("Item date is outside the changelog's date range");
        }
    }

    getMostRecentItem() {
        return this.items[0];
    }

    getItemsInDateRange(start, end) {
        const startDate = new Date(start);
        const endDate = new Date(end);
        return this.items.filter(item => item.date >= startDate && item.date <= endDate);
    }

    toString() {
        return `Changelog (${this.startDate.toISOString().split('T')[0]}\n` +
            this.items.map(item => `  ${item.toString()}`).join('\n');
    }
}

////

// github 
const API_BASE_URL = 'https://api.github.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.OWNER;
const REPO = process.env.REPO;
// const START_DATE = '2023-01-01';
// const END_DATE = '2023-12-31';

const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json'
};

async function getCommitsInDateRange(startDate, endDate) {
    try {
        const response = await axios.get(`${API_BASE_URL}/repos/${OWNER}/${REPO}/commits`, {
            headers,
            params: {
                since: startDate,
                until: endDate
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching commits:', error.message);
        return [];
    }
}

async function getDiffBetweenCommits(baseCommit, headCommit) {
    try {
        const response = await axios.get(`${API_BASE_URL}/repos/${OWNER}/${REPO}/compare/${baseCommit}...${headCommit}`, {
            headers
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching diff:', error.message);
        return null;
    }
}

async function queryGreptileAPI(message, repository, branch = 'main', sessionId = null) {
    const url = 'https://api.greptile.com/v2/query';

    const headers = {
        'Authorization': `Bearer ${process.env.GREPTILE_API_KEY}`,
        'X-Github-Token': process.env.GITHUB_TOKEN,
        'Content-Type': 'application/json'
    };

    const data = {
        messages: [
            {
                id: `message-${Date.now()}`, // Generate a unique ID
                content: message,
                role: 'user'
            }
        ],
        repositories: [
            {
                remote: 'github',
                repository: repository,
                branch: branch
            }
        ],
        sessionId: sessionId,
        // stream: true
        stream: false
    };

    try {
        const response = await axios.post(url, data, { headers });
        // const response = await axios.post(url, data, { headers, responseType: 'stream' });
        // const stream = response.data
        // stream.on('data', data => { 
        //     data = data.toString()
        //     console.log(data) 
        // })
        console.log(response.data)
        // return response.data;
        return response.data;
    } catch (error) {
        console.error('Error querying Greptile API:', error.response ? error.response.data : error.message);
        throw error;
    }
}

async function getChangeLog(commits) {
    const firstCommit = commits[commits.length - 1];
    const lastCommit = commits[0];
    const secondCommit = commits[1];
 
    // getDiffBetweenCommits(firstCommit.sha, lastCommit.sha).then(diff => {
    getDiffBetweenCommits(firstCommit.sha, secondCommit.sha).then(diff => {
        // console.log(diff);
        // console.log(diff.files[0]);
        const patches = diff.files.map((file) => file.patch)
        // console.log(patches);    
        const patch = patches.join('\n');    
        // console.log(patch);
        if (diff) {
            const repo = `${OWNER}/${REPO}`;
            const message = `Generate a list of change log items from the following patch between two commits\n: ${patch}`;
            console.log(`querying greptile on repo ${repo}`);
            return queryGreptileAPI(message, repo);
        }
    });
}

const store = new Store();

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.get('/changelog', async (req, res) => {
    const currentDate = new Date().toISOString().split('T')[0];

    const changelog = store.get_instance();
    const mostRecentItem = changelog.getMostRecentItem();
    const mostRecentItemDate = mostRecentItem ? mostRecentItem.date.toISOString().split('T')[0] : null;

    const startDate = mostRecentItemDate // get previous date in store changelog.
        ? mostRecentItemDate
        : '2023-01-01';

    // Fetch commits from GitHub
    const commits = await getCommitsInDateRange('2024-09-25', currentDate);
    getChangeLog(commits).then(change => {
        console.log(change);
        const response = {
            period: `${startDate} to ${currentDate}`,
            existingChangelog: changelog.toString(),
            newChanges: null
        };
    
        console.log(response);
        // Send the response
        res.json(response);
    });
    // commits.forEach(commit => {
    //     changelog.addItem(commit.commit.author.date, commit.commit.message);
    // });

    // Prepare the response
    
    // res.send(`Changelog from ${startDate} to ${currentDate}:\n${changelog.toString()}`);
})

app.listen(port, () => {
    console.log(REPO);
    console.log(store.get_instance())
    console.log(`Example app listening on port ${port}`)
})
