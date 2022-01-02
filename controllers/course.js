import AWS from "aws-sdk";
import { nanoid } from "nanoid";
import Course from "../models/course";
import User from "../models/user";
import slugify from "slugify";
import { readFileSync } from "fs";
const stripe = require("stripe")(process.env.STRIPE_SECRET);
import Completed from '../models/completed'

const awsConfig = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKet: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
  apiVersion: process.env.AWS_API_VERSION,
};

const S3 = new AWS.S3(awsConfig);

export const uploadImage = async (req, res) => {
  // console.log(req.body)
  try {
    const { image } = req.body;
    if (!image) return res.status(400).send("No Image");

    const base64Data = new Buffer.from(
      image.replace(/^data:image\/\w+;base64,/, ""),
      "base64"
    );

    const type = image.split(";")[0].split("/")[1];

    const params = {
      Bucket: "novata-bucket",
      Key: `${nanoid()}.${type}`,
      Body: base64Data,
      //  ACL: "public-read",
      ContentEncoding: "base64",
      ContentType: `image/${type}`,
    };

    S3.upload(params, (err, data) => {
      if (err) {
        console.log(err);
        return res.sendStatus(400);
      }
      console.log(data);
      res.send(data);
    });
  } catch (error) {
    console.log(error);
  }
};

export const removeImage = async (req, res) => {
  try {
    const { image } = req.body;
    const params = {
      Bucket: image.Bucket,
      Key: image.key,
    };

    S3.deleteObject(params, (err, data) => {
      if (err) {
        console.log(err);
        res.sendStatus(400);
      }
      res.send({ ok: true });
    });
  } catch (error) {
    console.log(error);
  }
};

export const create = async (req, res) => {
  // console.log("Create Course", req.body)
  // return
  try {
    const alreadyExist = await Course.findOne({
      slug: slugify(req.body.name.toLowerCase()),
    });
    if (alreadyExist) return res.status(400).send("Title is taken");

    const course = await new Course({
      slug: slugify(req.body.name),
      instructor: req.user._id,
      ...req.body,
    }).save();

    res.json(course);
  } catch (error) {
    console.log(error);
    return res.status(400).send("Course create failed. Try again");
  }
};

export const read = async (req, res) => {
  try {
    const course = await Course.findOne({ slug: req.params.slug })
      .populate("instructor", "_id name")
      .exec();
    res.json(course);
  } catch (error) {
    console.log(error);
  }
};

export const uploadVideo = async (req, res) => {
  try {
    // console.log('req.user._id', req.user._id)
    // console.log('req.params.instructorId', req.params.instructorId)

    if (req.user._id != req.params.instructorId) {
      return res.status(400).send("Unauthorized");
    }

    const { video } = req.files;
    // console.log("vide => ",video)
    if (!video) return res.status(400).send("No video");

    const params = {
      Bucket: "novata-bucket",
      Key: `${nanoid()}.${video.type.split("/")[1]}`,
      Body: readFileSync(video.path),
      // ACL: "public-read",
      ContentType: video.type,
    };

    S3.upload(params, (err, data) => {
      if (err) {
        console.log("error =>", err);
        res.status(400).send("Upload failed.");
      }
      console.log(data);
      res.send(data);
    });
  } catch (error) {
    console.log(error);
  }
};

export const removeVideo = async (req, res) => {
  if (req.user._id != req.params.instructorId) {
    return res.status(400).send("Unauthorized");
  }

  try {
    const { video } = req.body;
    console.log("vide => ", video);

    const params = {
      Bucket: video.Bucket,
      Key: video.Key,
    };

    S3.deleteObject(params, (err, data) => {
      if (err) {
        console.log("error =>", err);
        res.status(400).send("Upload failed.");
      }
      console.log(data);
      res.send({ ok: true });
    });
  } catch (error) {
    console.log(error);
  }
};

export const addLesson = async (req, res) => {
  try {
    const { slug, instructorId } = req.params;
    const { title, content, video } = req.body;

    if (req.user._id != instructorId) {
      return res.status(400).send("Unauthorized");
    }

    const updated = await Course.findOneAndUpdate(
      { slug },
      {
        $push: { lessons: { title, content, video, slug: slugify(title) } },
      },
      { new: true }
    )
      .populate("instructor", "_id name")
      .exec();

    res.json(updated);
  } catch (error) {
    console.log(error);
    return res.status(400).send("Add lesson failed");
  }
};

export const update = async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(slug);

    const course = await Course.findOne({ slug }).exec();

    if (req.user._id != course.instructor) {
      return res.status(400).send("Unauthorized");
    }
    const updated = await Course.findOneAndUpdate({ slug }, req.body, {
      new: true,
    }).exec();

    res.json(updated);
  } catch (error) {
    console.log(error);
    return res.status(400).send(error.message);
  }
};

export const removeLesson = async (req, res) => {
  const { slug, lessonId } = req.params;
  const course = await Course.findOne({ slug }).exec();

  if (req.user._id != course.instructor) {
    return res.status(400).send("Unauthorized");
  }
  await Course.findByIdAndUpdate(course._id, {
    $pull: { lessons: { _id: lessonId } },
  }).exec();

  res.json({ ok: true });
};

export const updateLesson = async (req, res) => {
  console.log("UPDATE LESSON", req.body);
  try {
    const { slug } = req.params;
    const { _id, title, content, video, free_preview } = req.body;
    const course = await Course.findOne({ slug }).select("instructor").exec();

    if (course.instructor._id != req.user._id) {
      return res.status(400).send("Unauthorized");
    }

    const updated = await Course.updateOne(
      { "lessons._id": _id },
      {
        $set: {
          "lessons.$.title": title,
          "lessons.$.content": content,
          "lessons.$.video": video,
          "lessons.$.free_preview": free_preview,
        },
      },
      { new: true }
    ).exec();
    //  console.log('updated', updated)
    res.json({ ok: true });
  } catch (error) {
    console.log(error);
    return res.status(400).send("Update lesson failed");
  }
};

export const publishCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId).select("instructor").exec();

    if (course.instructor._id != req.user._id) {
      return res.status(400).send("Unauthorized");
    }
    const updated = await Course.findByIdAndUpdate(
      courseId,
      { published: true },
      { new: true }
    );
    console.log("updated", updated);
    res.json(updated);
  } catch (error) {
    console.log(error);
    return res.status(400).send("Publish course failed");
  }
};

export const unpublishCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId).select("instructor").exec();

    if (course.instructor._id != req.user._id) {
      return res.status(400).send("Unauthorized");
    }
    const updated = await Course.findByIdAndUpdate(
      courseId,
      { published: false },
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    console.log(error);
    return res.status(400).send("unpublish course failed");
  }
};

export const courses = async (req, res) => {
  const all = await Course.find({ published: true })
    .populate("instructor", "_id name")
    .exec();
  res.json(all);
};

export const checkEnrollment = async (req, res) => {
  const { courseId } = req.params;
  const user = await User.findById(req.user._id).exec();

  let ids = [];
  let length = user.courses && user.courses.length;
  for (let i = 0; i < length; i++) {
    ids.push(user.courses[i].toString());
  }
  res.json({
    status: ids.includes(courseId),
    course: await Course.findById(courseId).exec(),
  });
};

export const freeEnrollment = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId).exec();
    if (course.paid) return;
    const result = await User.findByIdAndUpdate(
      req.user._id,
      {
        $addToSet: { courses: course._id },
      },
      { new: true }
    ).exec();
    res.json({
      message: "Congratulations! You have successfully enrolled",
      course,
    });
  } catch (error) {
    console.log("free enrollment err", error);
    return res.status(400).send("Enrollment create failed");
  }
};

export const paidEnrollment = async (req, res) => {
 try {
  const course = await Course.findById(req.params.courseId)
  .populate("instructor")
  .exec();
if (!course.paid) return;
// application fee 30%
const fee = (course.price * 30) / 100;
// create stripe session
const session = await stripe.checkout.sessions.create({
  payment_method_types: ["card"],
  // purchase details
  line_items: [
    {
      name: course.name,
      amount: Math.round(course.price.toFixed(2) * 100),
      currency: "usd",
      quantity: 1,
    },
  ],
  // charge buyer and transfer remaining balance to seller (after fee)
  payment_intent_data: {
    application_fee_amount: Math.round(fee.toFixed(2) * 100),
    transfer_data: {
      destination: course.instructor.stripe_account_id,
    },
  },
  // redirect url afer successfull payment
  success_url: `${process.env.STRIPE_SUCCESS_URL}/${course._id}`,
  cancel_url: process.env.STRIPE_CANCEL_URL
});
console.log('session id => ', session)
await User.findByIdAndUpdate(req.user._id, {stripeSession: session}).exec()
res.send(session.id)
 } catch (error) {
   console.log('Paid enrollment create err', error)
   return res.status(400).send('Enrollment create failed')
 }
};


export const stripeSuccess = async (req, res) => {
  console.log('course =>')
  try {
    const course = await Course.findById(req.params.courseId).exec()
    const user = await User.findById(req.user._id).exec()
    if(!user.stripeSession.id) return res.sendStatus(400)

    const session = await stripe.checkout.sessions.retrieve(user.stripeSession.id)
    console.log('STRIPE SUCCESS', session)
    if(session.payment_status === 'paid') {
      await User.findByIdAndUpdate(user._id, {
        $addToSet: {courses: course._id},
        $set: {stripeSession: {}}
      }).exec()

    }
    res.json({success: true, course})
  } catch (error) {
    console.log("Stripe success error",error)
    res.json({success: false})
  }
}

export const userCourses = async (req, res) => {
  const user = await User.findById(req.user._id).exec()
  const courses = await Course.find({_id: {$in: user.courses}}).populate('instructor', '_id name').exec()

  res.json(courses)

}


export const markCompleted = async (req, res) => {
  const {courseId, lessonId} = req.body
  // console.log(courseId, lessonId)
  const existing = await Completed.findOne({
    user: req.user._id, course: courseId
  }).exec()
  if(existing) {
 const upaded = await Completed.findOneAndUpdate({
   user: req.user._id, course: courseId
 }, {
   $addToSet: {lessons: lessonId}
 }).exec()
 res.json({ok: true})
  } else{
    const created = await new Completed({
      user: req.user._id,
      course: courseId, 
      lessons: lessonId
    }).save()
    res.json({ok: true})
  }
}


export const listCompleted = async (req, res) => {
  try {
    const list = await Completed.findOne({user: req.user._id, course: req.body.courseId}).exec()
    list && res.json(list.lessons)
  } catch (error) {
    console.log(error)
  }
}

export const markIncomplete = async (req, res) => {
  try {
    const {courseId, lessonId} = req.body

    const updated = await Completed.findOneAndUpdate({user: req.user._id, course: courseId}, {
      $pull: {lessons: lessonId}
    }).exec()

    res.json({ok: true})

  } catch (error) {
    console.log(error)
  }
}