exports = async function() {
  // CHANGE THESE BELOW
  const sourceCluster = "hot-cluster"; // service name of source/hot cluster
  const targetCluster = "warm-cluster"; // service name of target/warm/cold cluster
  const db = "dataTieringDemo";
  const collection = "sample";
  const dateField = "date"; // field name for date field that will be queried on
  const archiveAfter = 60; // number of days after which to archive
  
  // settings (not required to change)
  const limit = 400; // decrease if archiving takes longer than function runtime limit of 90s
  const stagingDb = "dataTiering";
  const stagingCollName = "staging";
  
  // collection handles
  const sourceCollection = context.services.get(sourceCluster).db(db).collection(collName);
  const targetCollection = context.services.get(targetCluster).db(db).collection(collName);
  const targetStagingCollection = context.services.get(targetCluster).db(stagingDb).collection(stagingCollName);
  
  // DO NOT CHANGE THESE
  const archiveDate = new Date();
  archiveDate.setDate(-archiveAfter); // change number of days
  
  const query = { [dateField]: { $gt: archiveDate }};
  
  // =================================
  
  // TODO: check if dbs and collections exist
  
  await deleteDocsInStaging(targetStagingCollection);
  let docs = await findDocsToArchive(sourceCollection, query, limit);
  // console.log(docs);
  // console.log(JSON.stringify(docs));
  
  try {
    if (docs.length > 0) {
      await copyDocsToStaging(targetStagingCollection, docs);
      for (i = 0; i < docs.length; i++) {
        const doc = docs[i];
        await publishDoc(targetCollection, doc);
        await deleteDocument(sourceCollection, doc._id);
        await deleteDocument(targetStagingCollection, doc._id);
      }
    }
  } catch (err) {
    throw err;
  }
  
  console.log(`Successfully archived ${limit} documents`);
  
  return true;
};

async function deleteDocsInStaging(collection) {
  return collection.deleteMany({})
  .then(result => {
    if (result && result.deletedCount > 1) {
      console.log(`Deleted ${result.deletedCount} documents from staging`);
      return true;
    } else {
      console.log('No documents found in staging collection');
    }
    return false;
  })
  .catch(err => {
    console.error(`Delete in staging failed with error: ${err}`);
    throw err;
  });
}

async function findDocsToArchive(collection, query, limit) {
  return collection.find(query).limit(limit).toArray()
  .then(docs => {
    console.log(`Found ${docs.length} documents to be archived`);
    return docs;
  })
  .catch(err => console.error(`Failed to query to be archived documents: ${err}`));
}

async function copyDocsToStaging(collection, docs) {
  return collection.insertMany(docs)
  .then(result => {
    if (result && result.insertedIds.length === docs.length) {
      console.log(`Successfully copied ${result.insertedIds.length} documents to staging!`);
      return true;
    } else if (result && result.insertedIds.length > 0) {
      console.warn("Copied some, not all, documents to staging")
    } else {
      throw "Inserted zero documents"
    }
  })
  .catch(err => {
    console.error(`Failed to copy documents to staging: ${err}`);
    return false;
  });
}

async function publishDoc(collection, doc) {
  return collection.insertOne(doc)
  .then(result => {
    if (result && result.insertedId) {
      // console.log(`Published document with id: ${result.insertedId}`);
      return true
    } else {
      throw `Could not insert document ${doc}`;
    }
    return false;
  })
  .catch(err => {
    if (err instanceof FunctionError && err.message.startsWith("Duplicate key error")) {
      console.warn(`Document with id ${doc._id} already exists, continuing: ${err.message}`);
    } else {
      console.error(`Failed to publish document: ${err}`)
      throw err;
    }
  });
}

async function deleteDocument(collection, id) {
  return collection.deleteOne({_id: id})
  .then(result => {
    if (result && result.deletedCount === 1) {
      // console.log(`Deleted document with id: ${id}`);
      return true;
    } else {
      throw "Could not find document to delete";
    }
    return false;
  })
  .catch(err => {
    console.error(`Delete on source failed with error: ${err}`);
    throw err;
  });
}
