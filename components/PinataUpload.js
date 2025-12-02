import { useState } from 'react';
import axios from 'axios';
import JSZip from 'jszip';

/**
 * Pinata IPFS 文件上传组件（支持压缩）
 * 
 * 功能：
 * 1. 上传文件到 Pinata IPFS
 * 2. 自动压缩文件以节省存储空间
 * 3. 显示上传进度
 * 4. 返回 IPFS Hash 和 URL
 * 5. 支持视频、PDF、图片等多种格式
 */

export default function PinataUpload({ onUploadSuccess, accept = "*", enableCompression = true }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [error, setError] = useState('');
  const [compressing, setCompressing] = useState(false);

  // Pinata 配置（支持 VITE_ 和 NEXT_PUBLIC_ 前缀，优先使用 VITE_）
  const PINATA_JWT = process.env.VITE_PINATA_JWT || process.env.NEXT_PUBLIC_PINATA_JWT;
  const PINATA_API_KEY = process.env.VITE_PINATA_API_KEY || process.env.NEXT_PUBLIC_PINATA_API_KEY;
  const PINATA_SECRET = process.env.VITE_PINATA_SECRET_KEY || process.env.NEXT_PUBLIC_PINATA_SECRET_KEY;
  const IPFS_GATEWAY = process.env.VITE_IPFS_GATEWAY || process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud';

  // 验证配置
  if (!PINATA_JWT && (!PINATA_API_KEY || !PINATA_SECRET)) {
    console.error('⚠️ 请在 .env 文件中配置以下环境变量之一：');
    console.error('   - VITE_PINATA_JWT 或 NEXT_PUBLIC_PINATA_JWT');
    console.error('   - VITE_PINATA_API_KEY + VITE_PINATA_SECRET_KEY');
    console.error('   - NEXT_PUBLIC_PINATA_API_KEY + NEXT_PUBLIC_PINATA_SECRET_KEY');
  }

  // 文件选择处理
  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    // 文件大小限制（100MB）
    const maxSize = 100 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      setError('文件大小不能超过 100MB');
      return;
    }

    setFile(selectedFile);
    setError('');
    setUploadedFile(null);
  };

  // 压缩文件
  const compressFile = async (file) => {
    if (!enableCompression) return file;

    // 对于以下类型的文件，不压缩（直接上传以支持在线预览）：
    // 1. 已压缩格式
    // 2. 图片（jpg, png, gif, webp 等）
    // 3. 视频（mp4, webm, mov 等）
    // 4. PDF（浏览器原生支持预览）
    const noCompressionExtensions = [
      // 已压缩格式
      '.zip', '.rar', '.7z', '.gz', '.bz2', '.xz',
      // 图片
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico',
      // 视频
      '.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv',
      // 音频
      '.mp3', '.wav', '.ogg', '.m4a',
      // PDF
      '.pdf',
    ];
    
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (noCompressionExtensions.includes(fileExtension)) {
      // console.log(`文件格式 ${fileExtension} 不需要压缩，直接上传（支持在线预览）`);
      return file;
    }
    
    // 只压缩文档类文件（Word、Excel、PPT、文本等）
    // console.log(`文件格式 ${fileExtension} 将被压缩以节省存储空间`);
    

    setCompressing(true);
    try {
      const zip = new JSZip();
      
      // 读取文件内容
      const fileData = await file.arrayBuffer();
      
      // 添加到 zip
      zip.file(file.name, fileData);
      
      // 生成 zip 文件
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 } // 压缩级别 1-9，6 是平衡点
      });

      // console.log(`压缩完成: ${formatFileSize(file.size)} -> ${formatFileSize(zipBlob.size)}`);
      // console.log(`压缩率: ${((1 - zipBlob.size / file.size) * 100).toFixed(1)}%`);

      // 如果压缩后文件更大，返回原文件
      if (zipBlob.size >= file.size) {
        // console.log('压缩后文件更大，使用原文件');
        return file;
      }

      // 创建新的 File 对象
      const compressedFile = new File([zipBlob], file.name + '.zip', {
        type: 'application/zip',
        lastModified: Date.now()
      });

      return compressedFile;
    } catch (err) {
      console.error('压缩失败:', err);
      return file; // 压缩失败，返回原文件
    } finally {
      setCompressing(false);
    }
  };

  // 上传到 Pinata
  const uploadToPinata = async () => {
    if (!file) {
      setError('请先选择文件');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError('');

    try {
      // 压缩文件
      let fileToUpload = file;
      if (enableCompression) {
        fileToUpload = await compressFile(file);
      }

      // 创建 FormData
      const formData = new FormData();
      formData.append('file', fileToUpload);

      // 添加元数据（可选）
      // Pinata 要求：keyvalues 中的值必须是字符串、数字或 ISO_8601 格式的日期
      const metadata = JSON.stringify({
        name: file.name,
        keyvalues: {
          uploadedBy: 'web3-university',
          uploadedAt: new Date().toISOString(),
          fileType: file.type || 'unknown',
          fileSize: String(file.size), // 转换为字符串
          originalName: file.name,
          compressed: String(enableCompression && fileToUpload.name.endsWith('.zip')) // 布尔值转换为字符串
        }
      });
      formData.append('pinataMetadata', metadata);

      // 配置选项（可选）
      const options = JSON.stringify({
        cidVersion: 1 // 使用 CIDv1
      });
      formData.append('pinataOptions', options);

      // 上传配置
      const config = {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        }
      };

      // 添加认证
      if (PINATA_JWT) {
        // 使用 JWT（推荐）
        config.headers['Authorization'] = `Bearer ${PINATA_JWT}`;
      } else if (PINATA_API_KEY && PINATA_SECRET) {
        // 使用 API Key
        config.headers['pinata_api_key'] = PINATA_API_KEY;
        config.headers['pinata_secret_api_key'] = PINATA_SECRET;
      } else {
        throw new Error('未配置 Pinata 认证信息');
      }

      // console.log('开始上传到 Pinata IPFS...');

      // 发送请求
      const response = await axios.post(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        formData,
        config
      );

      // console.log('Pinata 响应:', response.data);

      // 检查响应格式，Pinata 可能返回 IpfsHash 或 hash
      const ipfsHash = response.data.IpfsHash || response.data.hash || response.data.cid;
      
      if (!ipfsHash) {
        console.error('Pinata 响应中没有找到 IPFS Hash:', response.data);
        throw new Error('上传成功但未返回 IPFS Hash，请检查 Pinata 配置');
      }

      const ipfsUrl = `${IPFS_GATEWAY}/ipfs/${ipfsHash}`;

      const result = {
        ipfsHash,
        ipfsUrl,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        uploadedFileName: fileToUpload.name,
        uploadedFileSize: fileToUpload.size,
        isCompressed: enableCompression && fileToUpload.name.endsWith('.zip'),
        timestamp: new Date().toISOString()
      };

      setUploadedFile(result);

      // 回调给父组件
      if (onUploadSuccess) {
        // console.log('调用 onUploadSuccess，传递 result:', result);
        onUploadSuccess(result);
      } else {
        console.warn('onUploadSuccess 回调未定义');
      }

      // console.log('✅ 上传成功:', result);

    } catch (err) {
      console.error('上传失败:', err);
      
      let errorMessage = '上传失败';
      if (err.response) {
        // Pinata API 错误
        errorMessage = err.response.data?.error?.details || err.response.data?.error || err.response.data?.message || '上传失败';
        console.error('Pinata 错误响应:', err.response.data);
      } else if (err.request) {
        // 网络错误
        errorMessage = '网络错误，请检查连接';
      } else {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // 重置
  const handleReset = () => {
    setFile(null);
    setUploadedFile(null);
    setUploadProgress(0);
    setError('');
    setCompressing(false);
  };

  return (
    <div className="space-y-4">
      {/* 文件选择区域 */}
      {!uploadedFile && (
        <div>
          <label className="block text-gray-300 mb-2">
            课程内容文件 <span className="text-gray-500">(视频/PDF/文档)</span>
          </label>
          
          <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-purple-500 transition">
            <input
              type="file"
              onChange={handleFileSelect}
              disabled={uploading || compressing}
              className="hidden"
              id="file-upload"
              accept={accept}
            />
            
            <label
              htmlFor="file-upload"
              className={`cursor-pointer block ${uploading || compressing ? 'opacity-50' : ''}`}
            >
              {/* 图标 */}
              <svg 
                className="mx-auto h-12 w-12 text-gray-400 mb-3" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
                />
              </svg>

              {file ? (
                <div>
                  <p className="text-white font-semibold mb-1">{file.name}</p>
                  <p className="text-gray-400 text-sm">{formatFileSize(file.size)}</p>
                  {!uploading && !compressing && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        handleReset();
                      }}
                      className="text-red-400 text-sm mt-2 hover:underline"
                    >
                      更换文件
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-gray-400">
                    点击选择文件或拖拽到这里
                  </p>
                  <p className="text-gray-500 text-sm mt-1">
                    支持 MP4, PDF, DOCX 等格式（最大 100MB）
                  </p>
                </div>
              )}
            </label>
          </div>

          {/* 压缩状态 */}
          {compressing && (
            <div className="mt-4 bg-blue-900/20 border border-blue-500 rounded-lg p-3">
              <div className="flex items-center space-x-3">
                <svg className="animate-spin h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-blue-400 text-sm">正在压缩文件以节省存储空间...</p>
              </div>
            </div>
          )}

          {/* 上传按钮 */}
          {file && !uploading && !compressing && !uploadedFile && (
            <button
              onClick={uploadToPinata}
              className="mt-4 w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition font-semibold"
            >
              上传到 IPFS {enableCompression && '(自动压缩)'}
            </button>
          )}

          {/* 上传进度 */}
          {uploading && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">上传中...</span>
                <span className="text-sm text-purple-400 font-semibold">
                  {uploadProgress}%
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 上传成功显示 */}
      {uploadedFile && (
        <div className="bg-green-900/20 border border-green-500 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            {/* 成功图标 */}
            <svg 
              className="h-6 w-6 text-green-400 flex-shrink-0 mt-0.5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" 
              />
            </svg>

            <div className="flex-1">
              <p className="text-green-400 font-semibold mb-2">
                ✅ 文件已上传到 IPFS
              </p>
              
              {/* 文件信息 */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">文件名:</span>
                  <span className="text-white">{uploadedFile.fileName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">原始大小:</span>
                  <span className="text-white">{formatFileSize(uploadedFile.fileSize)}</span>
                </div>
                {uploadedFile.isCompressed && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">压缩后大小:</span>
                    <span className="text-green-400">{formatFileSize(uploadedFile.uploadedFileSize)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">IPFS Hash:</span>
                  <span className="text-white font-mono text-xs">
                    {uploadedFile.ipfsHash.slice(0, 10)}...{uploadedFile.ipfsHash.slice(-8)}
                  </span>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex space-x-2 mt-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(uploadedFile.ipfsHash);
                    alert('IPFS Hash 已复制到剪贴板');
                  }}
                  className="text-xs bg-gray-600 text-white px-3 py-1.5 rounded hover:bg-gray-500 transition"
                >
                  复制 Hash
                </button>
                <button
                  onClick={handleReset}
                  className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 transition"
                >
                  重新上传
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* 提示信息 */}
      {!uploadedFile && (
        <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-3">
          <div className="flex items-start space-x-2">
            <svg 
              className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
              />
            </svg>
            <div className="text-blue-400 text-sm">
              <p className="font-semibold mb-1">关于 IPFS 存储：</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>文件将永久存储在去中心化网络</li>
                <li>自动压缩以节省存储空间</li>
                <li>任何人都可以通过 IPFS Hash 访问</li>
                <li>文件内容不可篡改（Hash 验证）</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
