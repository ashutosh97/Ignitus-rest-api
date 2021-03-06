import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';

import { User } from '../Models/userModel';
import { Professor } from '../Models/professorModel';
import { Student } from '../Models/studentModel';
import { InterfaceUserModel } from 'api/Models/@modelTypes/interfaceUserModel';
import { TokenType } from './@controllerTypes/interfaceToken';
import { config } from '../Configuration/config';
import { responseHandler } from '../Utils/responseHandler';
import { clientDataType } from 'api/Types/globalTypes';

/* If the user is already registered through LinkedIn & trying to register through email. */
function socialLoginCheck(
  req: Request,
  res: Response,
  userType: string,
  user: InterfaceUserModel,
) {
  if (
    /* && user.isUserVerified === 1 */
    userType === user.userType &&
    !user.password &&
    user.oAuth.linkedIn.profileUrl &&
    user.oAuth.linkedIn.accessToken
  ) {
    bcrypt.hash(req.body.password, 10, (err, hash) => {
      if (err) {
        return responseHandler.error(res, err.message, 400);
      }
      User.update(
        { email: req.body.email },
        { $set: { password: hash } },
        (error, result) => {
          if (error) {
            throw new Error(err);
          }
          return responseHandler.success(res, result);
        },
      );
    });
  }
}

const profileDataInsertion = (userType: string) => {
  let profile;
  if (userType === 'student') {
    profile = new Student({});
  } else if (userType === 'professor') {
    profile = new Professor({});
  }
  return profile?.save();
};

export const register = async (req: Request, res: Response) => {
  const {
    body: { email, userType, password },
  } = req;
  try {
    const userObject: InterfaceUserModel | null = await User.findOne({ email });
    if (userObject && userObject.oAuth.linkedIn.profileUrl) {
      socialLoginCheck(req, res, userType, userObject);
    } else if (userObject) {
      return responseHandler.error(res, 'User already exists!', 409);
    } else {
      bcrypt.hash(password, 10, async (err, hashedPassword) => {
        if (err) {
          return responseHandler.error(res, err.message, 400);
        }
        const newUser = new User({
          _id: new mongoose.Types.ObjectId(),
          email,
          password: hashedPassword,
          userType,
        });
        try {
          await newUser.save().then(_ => {
            profileDataInsertion(userType)?.then(() => {
              res.json({
                statusCode: 200,
                success: true,
                message: 'Success',
              });
            });
          });
        } catch (err) {
          return responseHandler.error(res, err.message, 400);
        }
      });
    }
  } catch (err) {
    return responseHandler.error(res, err.message, 400);
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const userObject: InterfaceUserModel | null = await User.findOne({
      email: req.body.email,
    });
    if (!userObject) {
      return responseHandler.error(res, 'User not found!', 401);
    } else {
      const { email, userType, _id, admin }: InterfaceUserModel = userObject;
      if (req.body.userType === userType) {
        bcrypt.compare(
          req.body.password,
          userObject.password,
          (err, result) => {
            if (err) {
              return responseHandler.error(res, err.message, 400);
            }
            if (result) {
              const jwtToken: string = jwt.sign(
                {
                  email,
                  userType,
                  userId: _id,
                  admin: admin || false,
                },
                config.secretKey,
                { expiresIn: '4h' },
              );
              const clientData: clientDataType = {
                ...userObject.toJSON(),
              };
              return responseHandler.success(res, { jwtToken, clientData });
            }
            return responseHandler.error(res, 'Incorrect password!', 401);
          },
        );
      } else {
        return responseHandler.error(res, 'Unauthorized access denied!', 403);
      }
    }
  } catch (err) {
    return responseHandler.error(res, err.message, 400);
  }
};

export const getUserInformationFromToken = async (
  req: Request,
  res: Response,
) => {
  if (req.headers && req.headers.authorization) {
    try {
      const decryptedToken: TokenType = <TokenType>(
        jwt.verify(req.headers.authorization, config.secretKey)
      );
      try {
        const userObject: InterfaceUserModel | null = await User.findOne({
          _id: decryptedToken.userId,
        });
        res.json({
          userObject,
        });
      } catch (err) {
        return responseHandler.error(res, err.message, 404);
      }
    } catch (err) {
      return responseHandler.error(res, err.message, 401);
    }
  } else {
    return responseHandler.error(res, 'No token provided! 💭', 401);
  }
};
