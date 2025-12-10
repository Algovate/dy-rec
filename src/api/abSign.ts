/**
 * ab_sign 算法实现
 * 移植自 DouyinLiveRecorder/src/ab_sign.py
 */

/**
 * RC4 加密
 */
function rc4Encrypt(plaintext: string, key: string): string {
  // 初始化状态数组
  const s = Array.from({ length: 256 }, (_, i) => i);

  // 使用密钥对状态数组进行置换
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }

  // 生成密钥流并加密
  let i = 0;
  j = 0;
  const result: string[] = [];
  for (const char of plaintext) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    const t = (s[i] + s[j]) % 256;
    result.push(String.fromCharCode(s[t] ^ char.charCodeAt(0)));
  }

  return result.join('');
}

/**
 * 左旋转
 */
function leftRotate(x: number, n: number): number {
  n %= 32;
  return ((x << n) | (x >>> (32 - n))) & 0xffffffff;
}

/**
 * 获取 Tj 常量
 */
function getTj(j: number): number {
  if (j >= 0 && j < 16) {
    return 0x79cc4519; // 2043430169
  } else if (j >= 16 && j < 64) {
    return 0x7a879d8a; // 2055708042
  } else {
    throw new Error('invalid j for constant Tj');
  }
}

/**
 * FF 函数
 */
function ffJ(j: number, x: number, y: number, z: number): number {
  if (j >= 0 && j < 16) {
    return (x ^ y ^ z) & 0xffffffff;
  } else if (j >= 16 && j < 64) {
    return ((x & y) | (x & z) | (y & z)) & 0xffffffff;
  } else {
    throw new Error('invalid j for bool function FF');
  }
}

/**
 * GG 函数
 */
function ggJ(j: number, x: number, y: number, z: number): number {
  if (j >= 0 && j < 16) {
    return (x ^ y ^ z) & 0xffffffff;
  } else if (j >= 16 && j < 64) {
    return ((x & y) | (~x & z)) & 0xffffffff;
  } else {
    throw new Error('invalid j for bool function GG');
  }
}

/**
 * SM3 哈希算法类
 */
class SM3 {
  private reg: number[] = [];
  private chunk: number[] = [];
  private size = 0;

  constructor() {
    this.reset();
  }

  reset(): void {
    // 初始化寄存器值
    this.reg = [
      1937774191, 1226093241, 388252375, 3666478592, 2842636476, 372324522, 3817729613, 2969243214,
    ];
    this.chunk = [];
    this.size = 0;
  }

  write(data: string | number[]): void {
    // 将输入转换为字节数组
    let a: number[];
    if (typeof data === 'string') {
      // 直接转换为UTF-8字节列表
      a = Array.from(new TextEncoder().encode(data));
    } else {
      a = data;
    }

    this.size += a.length;
    let f = 64 - this.chunk.length;

    if (a.length < f) {
      // 如果数据长度小于剩余空间，直接添加
      this.chunk.push(...a);
    } else {
      // 否则分块处理
      this.chunk.push(...a.slice(0, f));

      while (this.chunk.length >= 64) {
        this.compress(this.chunk.slice(0, 64));
        if (f < a.length) {
          this.chunk = a.slice(f, Math.min(f + 64, a.length));
        } else {
          this.chunk = [];
        }
        f += 64;
      }
    }
  }

  private fill(): void {
    // 计算比特长度
    const bitLength = 8 * this.size;

    // 添加填充位
    let paddingPos = this.chunk.length;
    this.chunk.push(0x80);
    paddingPos = (paddingPos + 1) % 64;

    // 如果剩余空间不足8字节，则填充到下一个块
    if (64 - paddingPos < 8) {
      paddingPos -= 64;
    }

    // 填充0直到剩余8字节用于存储长度
    while (paddingPos < 56) {
      this.chunk.push(0);
      paddingPos++;
    }

    // 添加消息长度（高32位）
    const highBits = Math.floor(bitLength / 4294967296);
    for (let i = 0; i < 4; i++) {
      this.chunk.push((highBits >>> (8 * (3 - i))) & 0xff);
    }

    // 添加消息长度（低32位）
    for (let i = 0; i < 4; i++) {
      this.chunk.push((bitLength >>> (8 * (3 - i))) & 0xff);
    }
  }

  private compress(data: number[]): void {
    if (data.length < 64) {
      throw new Error('compress error: not enough data');
    }

    // 消息扩展
    const w = new Array(132).fill(0);

    // 将字节数组转换为字
    for (let t = 0; t < 16; t++) {
      w[t] =
        ((data[4 * t] << 24) | (data[4 * t + 1] << 16) | (data[4 * t + 2] << 8) | data[4 * t + 3]) &
        0xffffffff;
    }

    // 消息扩展
    for (let j = 16; j < 68; j++) {
      let a = w[j - 16] ^ w[j - 9] ^ leftRotate(w[j - 3], 15);
      a = a ^ leftRotate(a, 15) ^ leftRotate(a, 23);
      w[j] = (a ^ leftRotate(w[j - 13], 7) ^ w[j - 6]) & 0xffffffff;
    }

    // 计算w'
    for (let j = 0; j < 64; j++) {
      w[j + 68] = (w[j] ^ w[j + 4]) & 0xffffffff;
    }

    // 压缩
    let [a, b, c, d, e, f, g, h] = this.reg;

    for (let j = 0; j < 64; j++) {
      const ss1 = leftRotate((leftRotate(a, 12) + e + leftRotate(getTj(j), j)) & 0xffffffff, 7);
      const ss2 = ss1 ^ leftRotate(a, 12);
      const tt1 = (ffJ(j, a, b, c) + d + ss2 + w[j + 68]) & 0xffffffff;
      const tt2 = (ggJ(j, e, f, g) + h + ss1 + w[j]) & 0xffffffff;

      d = c;
      c = leftRotate(b, 9);
      b = a;
      a = tt1;
      h = g;
      g = leftRotate(f, 19);
      f = e;
      e = (tt2 ^ leftRotate(tt2, 9) ^ leftRotate(tt2, 17)) & 0xffffffff;
    }

    // 更新寄存器
    this.reg[0] ^= a;
    this.reg[1] ^= b;
    this.reg[2] ^= c;
    this.reg[3] ^= d;
    this.reg[4] ^= e;
    this.reg[5] ^= f;
    this.reg[6] ^= g;
    this.reg[7] ^= h;
  }

  sum(data?: string | number[], outputFormat?: 'hex'): number[] | string {
    // 如果提供了输入，则重置并写入
    if (data !== undefined) {
      this.reset();
      this.write(data);
    }

    this.fill();

    // 分块压缩
    for (let f = 0; f < this.chunk.length; f += 64) {
      this.compress(this.chunk.slice(f, f + 64));
    }

    if (outputFormat === 'hex') {
      // 十六进制输出
      return this.reg.map((val) => val.toString(16).padStart(8, '0')).join('');
    } else {
      // 字节数组输出
      const result: number[] = [];
      for (let f = 0; f < 8; f++) {
        const c = this.reg[f];
        result.push((c >>> 24) & 0xff);
        result.push((c >>> 16) & 0xff);
        result.push((c >>> 8) & 0xff);
        result.push(c & 0xff);
      }
      this.reset();
      return result;
    }
  }
}

/**
 * 魔改 base64 编码
 */
function resultEncrypt(longStr: string, num: string | null = null): string {
  // 魔改base64编码表
  const encodingTables: Record<string, string> = {
    s0: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',
    s1: 'Dkdpgh4ZKsQB80/Mfvw36XI1R25+WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=',
    s2: 'Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=',
    s3: 'ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe',
    s4: 'Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe',
  };

  // 位移常量
  const masks = [16515072, 258048, 4032, 63]; // 对应 0, 1, 2 的掩码，添加63作为第四个掩码
  const shifts = [18, 12, 6, 0]; // 对应的位移量

  const encodingTable = encodingTables[num || 's0'];

  let result = '';
  let roundNum = 0;
  let longInt = getLongInt(roundNum, longStr);

  const totalChars = Math.ceil((longStr.length / 3) * 4);

  for (let i = 0; i < totalChars; i++) {
    // 每4个字符处理一组3字节
    if (Math.floor(i / 4) !== roundNum) {
      roundNum++;
      longInt = getLongInt(roundNum, longStr);
    }

    // 计算当前位置的索引
    const index = i % 4;

    // 使用掩码和位移提取6位值
    const charIndex = (longInt & masks[index]) >>> shifts[index];

    result += encodingTable[charIndex];
  }

  return result;
}

/**
 * 获取长整型
 */
function getLongInt(roundNum: number, longStr: string): number {
  roundNum = roundNum * 3;

  // 获取字符串中的字符，如果超出范围则使用0
  const char1 = roundNum < longStr.length ? longStr.charCodeAt(roundNum) : 0;
  const char2 = roundNum + 1 < longStr.length ? longStr.charCodeAt(roundNum + 1) : 0;
  const char3 = roundNum + 2 < longStr.length ? longStr.charCodeAt(roundNum + 2) : 0;

  return (char1 << 16) | (char2 << 8) | char3;
}

/**
 * 生成随机数
 */
function generRandom(randomNum: number, option: number[]): number[] {
  const byte1 = randomNum & 255;
  const byte2 = (randomNum >>> 8) & 255;

  return [
    (byte1 & 170) | (option[0] & 85), // 偶数位与option[0]的奇数位合并
    (byte1 & 85) | (option[0] & 170), // 奇数位与option[0]的偶数位合并
    (byte2 & 170) | (option[1] & 85), // 偶数位与option[1]的奇数位合并
    (byte2 & 85) | (option[1] & 170), // 奇数位与option[1]的偶数位合并
  ];
}

/**
 * 生成随机字符串
 */
function generateRandomStr(): string {
  // 使用与JS版本相同的固定随机值
  const randomValues = [0.123456789, 0.987654321, 0.555555555];

  // 生成三组随机字节并合并
  const randomBytes: number[] = [];
  randomBytes.push(...generRandom(Math.floor(randomValues[0] * 10000), [3, 45]));
  randomBytes.push(...generRandom(Math.floor(randomValues[1] * 10000), [1, 0]));
  randomBytes.push(...generRandom(Math.floor(randomValues[2] * 10000), [1, 5]));

  return String.fromCharCode(...randomBytes);
}

/**
 * 生成 RC4 BB 字符串
 */
function generateRc4BbStr(
  urlSearchParams: string,
  userAgent: string,
  windowEnvStr: string,
  suffix: string = 'cus',
  args: number[] | null = null
): string {
  if (args === null) {
    args = [0, 1, 14];
  }

  const sm3 = new SM3();
  const startTime = Date.now();

  // 三次加密处理
  // 1: url_search_params两次sm3之的结果
  const urlSearchParamsFirst = sm3.sum(urlSearchParams + suffix);
  if (typeof urlSearchParamsFirst === 'string') {
    throw new Error('Unexpected string return from SM3.sum');
  }
  const urlSearchParamsList = sm3.sum(urlSearchParamsFirst);
  if (typeof urlSearchParamsList === 'string') {
    throw new Error('Unexpected string return from SM3.sum');
  }
  // 2: 对后缀两次sm3之的结果
  const cusFirst = sm3.sum(suffix);
  if (typeof cusFirst === 'string') {
    throw new Error('Unexpected string return from SM3.sum');
  }
  const cus = sm3.sum(cusFirst);
  if (typeof cus === 'string') {
    throw new Error('Unexpected string return from SM3.sum');
  }
  // 3: 对ua处理之后的结果
  const uaKey = String.fromCharCode(0) + String.fromCharCode(1) + String.fromCharCode(14); // [1/256, 1, 14]
  const uaResult = sm3.sum(resultEncrypt(rc4Encrypt(userAgent, uaKey), 's3'));
  if (typeof uaResult === 'string') {
    throw new Error('Unexpected string return from SM3.sum');
  }
  const ua = uaResult;

  const endTime = startTime + 100;

  // 构建配置对象
  const b: Record<number, any> = {
    8: 3,
    10: endTime,
    15: {
      aid: 6383,
      pageId: 110624,
      boe: false,
      ddrt: 7,
      paths: {
        include: Array.from({ length: 7 }, () => ({})),
        exclude: [],
      },
      track: {
        mode: 0,
        delay: 300,
        paths: [],
      },
      dump: true,
      rpU: 'hwj',
    },
    16: startTime,
    18: 44,
    19: [1, 0, 1, 5],
  };

  function splitToBytes(num: number): number[] {
    return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255];
  }

  // 处理时间戳
  const startTimeBytes = splitToBytes(b[16]);
  b[20] = startTimeBytes[0];
  b[21] = startTimeBytes[1];
  b[22] = startTimeBytes[2];
  b[23] = startTimeBytes[3];
  b[24] = Math.floor(b[16] / 256 / 256 / 256 / 256) & 255;
  b[25] = Math.floor(b[16] / 256 / 256 / 256 / 256 / 256) & 255;

  // 处理Arguments参数
  const arg0Bytes = splitToBytes(args[0]);
  b[26] = arg0Bytes[0];
  b[27] = arg0Bytes[1];
  b[28] = arg0Bytes[2];
  b[29] = arg0Bytes[3];

  b[30] = Math.floor(args[1] / 256) & 255;
  b[31] = args[1] % 256;

  const arg1Bytes = splitToBytes(args[1]);
  b[32] = arg1Bytes[0];
  b[33] = arg1Bytes[1];

  const arg2Bytes = splitToBytes(args[2]);
  b[34] = arg2Bytes[0];
  b[35] = arg2Bytes[1];
  b[36] = arg2Bytes[2];
  b[37] = arg2Bytes[3];

  // 处理加密结果
  b[38] = urlSearchParamsList[21];
  b[39] = urlSearchParamsList[22];
  b[40] = cus[21];
  b[41] = cus[22];
  b[42] = ua[23];
  b[43] = ua[24];

  // 处理结束时间
  const endTimeBytes = splitToBytes(b[10]);
  b[44] = endTimeBytes[0];
  b[45] = endTimeBytes[1];
  b[46] = endTimeBytes[2];
  b[47] = endTimeBytes[3];
  b[48] = b[8];
  b[49] = Math.floor(b[10] / 256 / 256 / 256 / 256) & 255;
  b[50] = Math.floor(b[10] / 256 / 256 / 256 / 256 / 256) & 255;

  // 处理配置项
  b[51] = b[15].pageId;

  const pageIdBytes = splitToBytes(b[15].pageId);
  b[52] = pageIdBytes[0];
  b[53] = pageIdBytes[1];
  b[54] = pageIdBytes[2];
  b[55] = pageIdBytes[3];

  b[56] = b[15].aid;
  b[57] = b[15].aid & 255;
  b[58] = (b[15].aid >>> 8) & 255;
  b[59] = (b[15].aid >>> 16) & 255;
  b[60] = (b[15].aid >>> 24) & 255;

  // 处理环境信息
  const windowEnvList = Array.from(windowEnvStr, (char) => char.charCodeAt(0));
  b[64] = windowEnvList.length;
  b[65] = b[64] & 255;
  b[66] = (b[64] >>> 8) & 255;

  b[69] = 0;
  b[70] = 0;
  b[71] = 0;

  // 计算校验和
  b[72] =
    b[18] ^
    b[20] ^
    b[26] ^
    b[30] ^
    b[38] ^
    b[40] ^
    b[42] ^
    b[21] ^
    b[27] ^
    b[31] ^
    b[35] ^
    b[39] ^
    b[41] ^
    b[43] ^
    b[22] ^
    b[28] ^
    b[32] ^
    b[36] ^
    b[23] ^
    b[29] ^
    b[33] ^
    b[37] ^
    b[44] ^
    b[45] ^
    b[46] ^
    b[47] ^
    b[48] ^
    b[49] ^
    b[50] ^
    b[24] ^
    b[25] ^
    b[52] ^
    b[53] ^
    b[54] ^
    b[55] ^
    b[57] ^
    b[58] ^
    b[59] ^
    b[60] ^
    b[65] ^
    b[66] ^
    b[70] ^
    b[71];

  // 构建最终字节数组
  const bb = [
    b[18],
    b[20],
    b[52],
    b[26],
    b[30],
    b[34],
    b[58],
    b[38],
    b[40],
    b[53],
    b[42],
    b[21],
    b[27],
    b[54],
    b[55],
    b[31],
    b[35],
    b[57],
    b[39],
    b[41],
    b[43],
    b[22],
    b[28],
    b[32],
    b[60],
    b[36],
    b[23],
    b[29],
    b[33],
    b[37],
    b[44],
    b[45],
    b[59],
    b[46],
    b[47],
    b[48],
    b[49],
    b[50],
    b[24],
    b[25],
    b[65],
    b[66],
    b[70],
    b[71],
  ];
  bb.push(...windowEnvList);
  bb.push(b[72]);

  return rc4Encrypt(String.fromCharCode(...bb), String.fromCharCode(121));
}

/**
 * ab_sign 主函数
 * @param urlSearchParams - URL 查询参数字符串
 * @param userAgent - User-Agent 字符串
 * @returns a_bogus 签名
 */
export function abSign(urlSearchParams: string, userAgent: string): string {
  const windowEnvStr = '1920|1080|1920|1040|0|30|0|0|1872|92|1920|1040|1857|92|1|24|Win32';

  // 1. 生成随机字符串前缀
  // 2. 生成RC4加密的主体部分
  // 3. 对结果进行最终加密并添加等号后缀
  return (
    resultEncrypt(
      generateRandomStr() + generateRc4BbStr(urlSearchParams, userAgent, windowEnvStr),
      's4'
    ) + '='
  );
}
